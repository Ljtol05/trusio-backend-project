
import { logger } from '../../lib/logger.js';
import { createAgentResponse } from '../../lib/openai.js';
import { globalAIBrain, getUserContext } from '../../lib/vectorstore.js';
import { db } from '../../lib/db.js';
import type { FinancialContext } from '../tools/types.js';

export interface OnboardingProfile {
  userId: string;
  userType: 'consumer' | 'creator' | 'hybrid';
  spendingPersonality: 'analytical' | 'emotional' | 'impulsive' | 'conservative';
  incomeType: 'salary' | 'freelance' | 'multi_stream' | 'mixed';
  churchAttendance: boolean;
  paysTithes: boolean;
  needsTitheEnvelope: boolean;
  riskTolerance: 'low' | 'medium' | 'high';
  financialGoals: string[];
  preferredEnvelopeCount: number;
  monthlyIncome?: number;
  hasBusinessExpenses: boolean;
  primaryConcerns: string[];
}

export interface OnboardingResponse {
  profile: OnboardingProfile;
  recommendedEnvelopes: Array<{
    name: string;
    purpose: string;
    suggestedAllocation: number;
    category: string;
    priority: 'essential' | 'important' | 'optional';
    autoRoutePercentage?: number;
  }>;
  personalizedWelcome: string;
  nextSteps: string[];
  coachingFocus: string[];
}

class OnboardingAgent {
  private readonly systemPrompt = `
You are an expert financial onboarding agent specializing in envelope budgeting and personal finance coaching.

Your role is to:
1. Analyze user responses to determine their financial profile
2. Detect user type: consumer (salary-based) vs creator (irregular income) vs hybrid
3. Identify spending personality and financial habits
4. Determine if user needs a Tithe envelope (ONLY if they attend church AND pay tithes)
5. Create personalized envelope recommendations
6. Provide warm, encouraging guidance

Key Detection Criteria:
- CONSUMER: Regular salary, predictable income, traditional job
- CREATOR: Content creation, freelance, irregular income, business expenses
- HYBRID: Both salary and creator income

Tithe Envelope Rules (CRITICAL):
- Only suggest if user explicitly mentions church attendance AND tithing
- Auto-route 10% ONLY for confirmed church-goers who tithe
- Never assume religious preferences

Personality Types:
- ANALYTICAL: Data-driven, detail-oriented, research-heavy decisions
- EMOTIONAL: Impulse purchases, mood-based spending, social influence
- IMPULSIVE: Quick decisions, FOMO purchases, struggle with saving
- CONSERVATIVE: Risk-averse, traditional saving, minimal debt tolerance

Respond with detailed analysis and warm, personalized recommendations.
  `;

  async processOnboarding(
    userId: string,
    responses: Record<string, any>,
    financialContext?: FinancialContext
  ): Promise<OnboardingResponse> {
    try {
      logger.info({ userId }, 'Processing onboarding with intelligent user detection');

      // Analyze responses to build user profile
      const profile = await this.analyzeUserProfile(userId, responses);
      
      // Get relevant knowledge from Global AI Brain
      const userContext = await getUserContext(
        userId,
        `Onboarding ${profile.userType} with ${profile.spendingPersonality} personality`,
        profile.userType,
        5
      );

      // Generate personalized envelope recommendations
      const recommendedEnvelopes = await this.generateEnvelopeRecommendations(
        profile,
        userContext.knowledge
      );

      // Create personalized welcome message and coaching plan
      const { personalizedWelcome, nextSteps, coachingFocus } = 
        await this.generatePersonalizedGuidance(profile, userContext);

      // Store onboarding profile
      await this.storeOnboardingProfile(userId, profile);

      const response: OnboardingResponse = {
        profile,
        recommendedEnvelopes,
        personalizedWelcome,
        nextSteps,
        coachingFocus,
      };

      logger.info({
        userId,
        userType: profile.userType,
        needsTithe: profile.needsTitheEnvelope,
        envelopeCount: recommendedEnvelopes.length
      }, 'Onboarding analysis completed');

      return response;
    } catch (error) {
      logger.error({ error, userId }, 'Onboarding processing failed');
      throw error;
    }
  }

  private async analyzeUserProfile(
    userId: string,
    responses: Record<string, any>
  ): Promise<OnboardingProfile> {
    const analysisPrompt = `
    Analyze these onboarding responses and create a comprehensive user profile:

    Responses: ${JSON.stringify(responses, null, 2)}

    Determine:
    1. User Type (consumer/creator/hybrid) based on income sources and work description
    2. Spending Personality based on shopping habits and decision-making style
    3. Income Type and stability
    4. Church attendance AND tithing status (be very specific - both required for tithe envelope)
    5. Financial goals and concerns
    6. Risk tolerance
    7. Business expense patterns

    Be thorough in your analysis and provide reasoning for each classification.
    `;

    const analysis = await createAgentResponse(
      this.systemPrompt,
      analysisPrompt,
      [],
      { temperature: 0.1, useAdvancedModel: true }
    );

    // Parse analysis and extract profile data
    const profile = await this.extractProfileFromAnalysis(userId, analysis, responses);
    return profile;
  }

  private async extractProfileFromAnalysis(
    userId: string,
    analysis: string,
    responses: Record<string, any>
  ): Promise<OnboardingProfile> {
    // Extract key indicators from responses
    const workDescription = responses.work?.toLowerCase() || '';
    const incomeDescription = responses.income?.toLowerCase() || '';
    const churchResponse = responses.church?.toLowerCase() || '';
    const titheResponse = responses.tithe?.toLowerCase() || responses.giving?.toLowerCase() || '';
    
    // Determine user type
    let userType: 'consumer' | 'creator' | 'hybrid' = 'consumer';
    if (workDescription.includes('content') || workDescription.includes('youtube') || 
        workDescription.includes('creator') || workDescription.includes('freelance') ||
        incomeDescription.includes('irregular') || incomeDescription.includes('variable')) {
      userType = incomeDescription.includes('salary') ? 'hybrid' : 'creator';
    }

    // Determine income type
    let incomeType: 'salary' | 'freelance' | 'multi_stream' | 'mixed' = 'salary';
    if (userType === 'creator') {
      incomeType = responses.platforms?.length > 1 ? 'multi_stream' : 'freelance';
    } else if (userType === 'hybrid') {
      incomeType = 'mixed';
    }

    // Church and tithe detection (CRITICAL LOGIC)
    const churchAttendance = churchResponse.includes('yes') || churchResponse.includes('regularly') ||
                           churchResponse.includes('weekly') || churchResponse.includes('attend');
    
    const paysTithes = (titheResponse.includes('yes') || titheResponse.includes('tithe') || 
                       titheResponse.includes('10%')) && churchAttendance;
    
    // Only create tithe envelope if BOTH conditions are true
    const needsTitheEnvelope = churchAttendance && paysTithes;

    // Determine spending personality
    const spendingPersonality = this.determineSpendingPersonality(responses);

    // Extract other profile data
    const monthlyIncome = responses.monthlyIncome ? parseFloat(responses.monthlyIncome) : undefined;
    const hasBusinessExpenses = responses.businessExpenses === 'yes' || userType !== 'consumer';

    return {
      userId,
      userType,
      spendingPersonality,
      incomeType,
      churchAttendance,
      paysTithes,
      needsTitheEnvelope,
      riskTolerance: responses.riskTolerance || 'medium',
      financialGoals: responses.goals || [],
      preferredEnvelopeCount: Math.min(responses.envelopeCount || 8, 10), // Max 10 envelopes
      monthlyIncome,
      hasBusinessExpenses,
      primaryConcerns: responses.concerns || [],
    };
  }

  private determineSpendingPersonality(responses: Record<string, any>): 'analytical' | 'emotional' | 'impulsive' | 'conservative' {
    const decisions = responses.decisionMaking?.toLowerCase() || '';
    const shopping = responses.shoppingHabits?.toLowerCase() || '';
    const planning = responses.financialPlanning?.toLowerCase() || '';

    if (decisions.includes('research') || planning.includes('spreadsheet') || 
        decisions.includes('analyze')) return 'analytical';
    
    if (shopping.includes('impulse') || decisions.includes('quickly') || 
        shopping.includes('mood')) return 'impulsive';
    
    if (shopping.includes('social') || decisions.includes('emotion') || 
        planning.includes('stress')) return 'emotional';
    
    return 'conservative'; // Default to conservative
  }

  private async generateEnvelopeRecommendations(
    profile: OnboardingProfile,
    relevantKnowledge: any[]
  ): Promise<Array<{
    name: string;
    purpose: string;
    suggestedAllocation: number;
    category: string;
    priority: 'essential' | 'important' | 'optional';
    autoRoutePercentage?: number;
  }>> {
    const envelopes = [];

    // Base envelopes for all users
    const baseEnvelopes = [
      {
        name: 'Emergency Fund',
        purpose: 'Financial safety net for unexpected expenses',
        suggestedAllocation: profile.userType === 'creator' ? 25 : 20,
        category: 'security',
        priority: 'essential' as const,
      },
      {
        name: 'Housing',
        purpose: 'Rent/mortgage, utilities, home maintenance',
        suggestedAllocation: profile.needsTitheEnvelope ? 25 : 30,
        category: 'necessities',
        priority: 'essential' as const,
      },
      {
        name: 'Transportation',
        purpose: 'Car payments, gas, maintenance, public transit',
        suggestedAllocation: 12,
        category: 'necessities',
        priority: 'essential' as const,
      },
      {
        name: 'Food & Groceries',
        purpose: 'Groceries and essential food expenses',
        suggestedAllocation: 12,
        category: 'necessities',
        priority: 'essential' as const,
      },
    ];

    envelopes.push(...baseEnvelopes);

    // Conditional Tithe envelope (ONLY for church-goers who tithe)
    if (profile.needsTitheEnvelope) {
      envelopes.unshift({
        name: 'Tithe & Giving',
        purpose: 'Church tithes and charitable giving',
        suggestedAllocation: 10,
        category: 'giving',
        priority: 'essential' as const,
        autoRoutePercentage: 10, // Auto-route 10% of all income
      });
    }

    // Creator-specific envelopes
    if (profile.userType === 'creator' || profile.userType === 'hybrid') {
      envelopes.push(
        {
          name: 'Tax Savings',
          purpose: 'Quarterly tax payments and self-employment tax',
          suggestedAllocation: 30,
          category: 'taxes',
          priority: 'essential' as const,
        },
        {
          name: 'Equipment & Software',
          purpose: 'Cameras, editing software, computers, gear',
          suggestedAllocation: 8,
          category: 'business',
          priority: 'important' as const,
        }
      );
    }

    // Additional envelopes based on user preferences and remaining allocation
    const remainingAllocation = 100 - envelopes.reduce((sum, env) => sum + env.suggestedAllocation, 0);
    
    const additionalEnvelopes = [
      {
        name: 'Personal & Entertainment',
        purpose: 'Movies, dining out, hobbies, personal care',
        suggestedAllocation: Math.min(remainingAllocation * 0.4, 15),
        category: 'lifestyle',
        priority: 'important' as const,
      },
      {
        name: 'Savings & Goals',
        purpose: 'Long-term savings and financial goals',
        suggestedAllocation: Math.min(remainingAllocation * 0.6, 20),
        category: 'savings',
        priority: 'important' as const,
      },
    ];

    envelopes.push(...additionalEnvelopes);

    // Ensure we don't exceed 10 envelopes (system limit)
    return envelopes.slice(0, 10);
  }

  private async generatePersonalizedGuidance(
    profile: OnboardingProfile,
    userContext: any
  ): Promise<{
    personalizedWelcome: string;
    nextSteps: string[];
    coachingFocus: string[];
  }> {
    const guidancePrompt = `
    Create a personalized welcome message and guidance plan for this user:

    User Profile:
    - Type: ${profile.userType}
    - Personality: ${profile.spendingPersonality}
    - Income: ${profile.incomeType}
    - Church/Tithe: ${profile.churchAttendance ? 'Yes' : 'No'}/${profile.paysTithes ? 'Yes' : 'No'}
    - Goals: ${profile.financialGoals.join(', ')}

    Create:
    1. A warm, encouraging welcome message that acknowledges their specific situation
    2. 3-5 concrete next steps for their financial journey
    3. 3-4 coaching focus areas based on their personality and goals

    Make it personal, actionable, and encouraging. Reference their specific user type and goals.
    `;

    const guidance = await createAgentResponse(
      this.systemPrompt,
      guidancePrompt,
      [],
      { temperature: 0.3 }
    );

    // Parse the guidance response (simplified for now)
    return {
      personalizedWelcome: `Welcome to your personalized financial journey! As a ${profile.userType} with ${profile.spendingPersonality} tendencies, you're uniquely positioned to build a strong financial foundation with envelope budgeting.`,
      nextSteps: [
        'Set up your personalized envelope system',
        'Link your bank account for automatic transaction tracking',
        'Define your first financial goal',
        'Complete your initial envelope allocations',
        profile.needsTitheEnvelope ? 'Configure automatic 10% tithe allocation' : 'Review spending categories'
      ].filter(Boolean),
      coachingFocus: [
        `${profile.userType}-specific budgeting strategies`,
        `${profile.spendingPersonality} spending habit optimization`,
        profile.userType === 'creator' ? 'Irregular income management' : 'Steady income optimization',
        'Emergency fund building'
      ]
    };
  }

  private async storeOnboardingProfile(userId: string, profile: OnboardingProfile): Promise<void> {
    try {
      // Store in user preferences or dedicated onboarding table
      await db.user.update({
        where: { id: userId },
        data: {
          onboardingCompleted: true,
          // Store profile data in user metadata or separate table
        }
      });

      logger.info({ userId, userType: profile.userType }, 'Onboarding profile stored');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to store onboarding profile');
    }
  }

  async getOnboardingQuestions(): Promise<Array<{
    id: string;
    question: string;
    type: 'text' | 'select' | 'multiselect' | 'boolean' | 'number';
    options?: string[];
    required: boolean;
    category: string;
  }>> {
    return [
      {
        id: 'work',
        question: 'What best describes your work situation?',
        type: 'select',
        options: [
          'Full-time employee with regular salary',
          'Part-time employee with hourly wages',
          'Freelancer/independent contractor',
          'Content creator (YouTube, TikTok, etc.)',
          'Small business owner',
          'Multiple income sources',
          'Student',
          'Unemployed/between jobs'
        ],
        required: true,
        category: 'income'
      },
      {
        id: 'monthlyIncome',
        question: 'What is your approximate monthly income? (Optional)',
        type: 'number',
        required: false,
        category: 'income'
      },
      {
        id: 'incomeStability',
        question: 'How would you describe your income?',
        type: 'select',
        options: [
          'Very stable (same amount each month)',
          'Mostly stable with small variations',
          'Somewhat unpredictable',
          'Highly variable month to month'
        ],
        required: true,
        category: 'income'
      },
      {
        id: 'church',
        question: 'Do you regularly attend church or religious services?',
        type: 'boolean',
        required: true,
        category: 'personal'
      },
      {
        id: 'tithe',
        question: 'Do you currently tithe or plan to tithe (give 10% of your income to your church)?',
        type: 'boolean',
        required: false,
        category: 'personal'
      },
      {
        id: 'decisionMaking',
        question: 'How do you typically make financial decisions?',
        type: 'select',
        options: [
          'I research extensively before making decisions',
          'I go with my gut feeling',
          'I make quick decisions to avoid overthinking',
          'I ask friends/family for advice',
          'I tend to put off financial decisions'
        ],
        required: true,
        category: 'personality'
      },
      {
        id: 'shoppingHabits',
        question: 'Which best describes your shopping habits?',
        type: 'select',
        options: [
          'I plan purchases in advance and stick to lists',
          'I sometimes make impulse purchases',
          'I frequently buy things I didn\'t plan to',
          'I shop when I\'m emotional or stressed',
          'I rarely spend on non-essential items'
        ],
        required: true,
        category: 'personality'
      },
      {
        id: 'goals',
        question: 'What are your primary financial goals? (Select all that apply)',
        type: 'multiselect',
        options: [
          'Build an emergency fund',
          'Pay off debt',
          'Save for a house',
          'Increase retirement savings',
          'Save for vacation/travel',
          'Start investing',
          'Improve budgeting skills',
          'Increase income',
          'Plan for major purchases'
        ],
        required: true,
        category: 'goals'
      },
      {
        id: 'concerns',
        question: 'What are your biggest financial concerns? (Select all that apply)',
        type: 'multiselect',
        options: [
          'Not having enough for emergencies',
          'Overspending on entertainment',
          'Irregular income',
          'Too much debt',
          'Not saving enough',
          'Tax planning and payments',
          'Understanding investments',
          'Managing business expenses'
        ],
        required: true,
        category: 'concerns'
      },
      {
        id: 'businessExpenses',
        question: 'Do you have business-related expenses (equipment, software, etc.)?',
        type: 'boolean',
        required: true,
        category: 'business'
      },
      {
        id: 'riskTolerance',
        question: 'How would you describe your risk tolerance?',
        type: 'select',
        options: [
          'Conservative (prefer guaranteed returns)',
          'Moderate (some risk for better returns)',
          'Aggressive (comfortable with high risk/reward)'
        ],
        required: true,
        category: 'investment'
      }
    ];
  }
}

export const onboardingAgent = new OnboardingAgent();

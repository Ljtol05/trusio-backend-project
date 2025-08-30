import { openai } from './openai.js';
import { db } from './db.js';
import { logger } from './logger.js';

// Enhanced vector storage with RAG capabilities for Global AI Brain
export interface FinancialKnowledge {
  id: string;
  type: 'budgeting_playbook' | 'irs_code' | 'consumer_strategy' | 'creator_strategy' | 'tax_tip' | 'financial_principle';
  title: string;
  content: string;
  category: string;
  subcategory?: string;
  embedding?: number[];
  metadata: {
    source: string;
    complexity: 'beginner' | 'intermediate' | 'advanced';
    userType: 'consumer' | 'creator' | 'business' | 'all';
    tags: string[];
    lastUpdated: string;
    relevanceScore?: number;
  };
  timestamp: Date;
}

export interface UserMemory {
  userId: string;
  type: 'conversation' | 'bank_statement' | 'spending_pattern' | 'goal' | 'preference' | 'tithe_setting';
  content: string;
  embedding?: number[];
  metadata: any;
  timestamp: Date;
}

class GlobalAIBrain {
  private knowledgeCache: Map<string, FinancialKnowledge[]> = new Map();
  private readonly cacheTimeout = 3600000; // 1 hour

  // Initialize the Global AI Brain with financial knowledge
  async initialize(): Promise<void> {
    logger.info('Initializing Global AI Brain with financial knowledge base');

    try {
      await this.loadBudgetingPlaybooks();
      await this.loadIRSCodes();
      await this.loadConsumerStrategies();
      await this.loadCreatorStrategies();
      await this.loadTitheGuidance();

      logger.info('Global AI Brain initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Global AI Brain');
      throw error;
    }
  }

  // Load budgeting playbooks into knowledge base
  private async loadBudgetingPlaybooks(): Promise<void> {
    const playbooks = [
      {
        id: 'envelope_budgeting_101',
        type: 'budgeting_playbook' as const,
        title: 'Envelope Budgeting for Beginners',
        content: `
        Envelope budgeting is a powerful method where you allocate specific amounts of money to different spending categories (envelopes). 
        Each envelope represents a budget category like groceries, rent, entertainment, etc. 

        Key principles:
        1. Assign every dollar a purpose before spending
        2. Use only the money allocated to each envelope
        3. When an envelope is empty, stop spending in that category
        4. Adjust allocations monthly based on actual spending

        For new users, start with 5-7 basic envelopes:
        - Housing (25-30% of income)
        - Transportation (10-15%)
        - Food (10-15%)
        - Utilities (5-10%)
        - Emergency Fund (20%)
        - Personal/Entertainment (5-10%)
        - Debt Payment (10-20%)
        `,
        category: 'budgeting',
        metadata: {
          source: 'financial_education',
          complexity: 'beginner' as const,
          userType: 'all' as const,
          tags: ['envelope', 'budgeting', 'allocation', 'spending'],
          lastUpdated: new Date().toISOString(),
        }
      },
      {
        id: 'creator_envelope_strategy',
        type: 'budgeting_playbook' as const,
        title: 'Envelope Budgeting for Content Creators',
        content: `
        Content creators face unique budgeting challenges with irregular income and business expenses mixed with personal expenses.

        Recommended envelope structure:
        1. Emergency Fund (30-40% when possible) - irregular income buffer
        2. Equipment & Software (10-15%) - cameras, editing software, computers
        3. Marketing & Promotion (5-10%) - ads, collaborations, events
        4. Tax Savings (25-30%) - quarterly tax payments, self-employment tax
        5. Business Insurance (2-5%) - liability, equipment protection
        6. Personal Living Expenses (remaining 40-50%)

        Monthly Income Strategy:
        - Use 3-month rolling average for budgeting
        - Prioritize tax and emergency savings during high-income months
        - Create separate business checking account
        - Track all business expenses for tax deductions
        `,
        category: 'budgeting',
        subcategory: 'creator_specific',
        metadata: {
          source: 'creator_financial_guide',
          complexity: 'intermediate' as const,
          userType: 'creator' as const,
          tags: ['creator', 'irregular_income', 'business_expenses', 'taxes'],
          lastUpdated: new Date().toISOString(),
        }
      }
    ];

    for (const playbook of playbooks) {
      await this.storeKnowledge(playbook);
    }
  }

  // Load IRS codes and tax information
  private async loadIRSCodes(): Promise<void> {
    const irsCodes = [
      {
        id: 'content_creator_deductions',
        type: 'irs_code' as const,
        title: 'Tax Deductions for Content Creators',
        content: `
        IRS Publication 535 - Business Expenses for Content Creators:

        Qualifying Business Expenses (100% deductible):
        - Equipment: Cameras, microphones, lighting, computers
        - Software: Editing software, streaming software, design tools
        - Internet & Phone: Business portion of internet and phone bills
        - Office Space: Home office deduction if used exclusively for business
        - Marketing: Advertising, business cards, promotional materials
        - Professional Services: Accountant, lawyer, editor fees
        - Travel: Business-related travel expenses
        - Education: Courses, workshops, conferences related to content creation

        Partially Deductible:
        - Meals with business associates (50%)
        - Entertainment for business purposes (varies)

        Record-keeping Requirements:
        - Keep receipts for all business expenses
        - Document business purpose
        - Maintain mileage logs for vehicle use
        - Track percentage of home used for business
        `,
        category: 'tax_code',
        subcategory: 'creator_deductions',
        metadata: {
          source: 'irs_publication_535',
          complexity: 'intermediate' as const,
          userType: 'creator' as const,
          tags: ['deductions', 'business_expenses', 'irs', 'taxes'],
          lastUpdated: new Date().toISOString(),
        }
      },
      {
        id: 'tithe_tax_implications',
        type: 'irs_code' as const,
        title: 'Tax Implications of Tithing and Charitable Giving',
        content: `
        IRS regulations for charitable deductions (IRC Section 170):

        Qualified Organizations:
        - Churches and religious organizations (501(c)(3))
        - Qualified charitable organizations
        - Must be organized in the US

        Deduction Limits:
        - Generally 50% of adjusted gross income for cash donations
        - Churches and qualified organizations: up to 60% AGI limit
        - Carry forward unused deductions up to 5 years

        Documentation Requirements:
        - Cash donations: bank record or written receipt
        - $250+: written acknowledgment from organization
        - Non-cash $500+: Form 8283

        Timing:
        - Deductions taken in year payment is made
        - Credit card donations: deductible when charged
        - Check donations: deductible when mailed
        `,
        category: 'tax_code',
        subcategory: 'charitable_giving',
        metadata: {
          source: 'irs_publication_526',
          complexity: 'intermediate' as const,
          userType: 'all' as const,
          tags: ['tithe', 'charitable_giving', 'deductions', 'religious'],
          lastUpdated: new Date().toISOString(),
        }
      }
    ];

    for (const code of irsCodes) {
      await this.storeKnowledge(code);
    }
  }

  // Load consumer-specific strategies
  private async loadConsumerStrategies(): Promise<void> {
    const strategies = [
      {
        id: 'salary_budgeting_strategy',
        type: 'consumer_strategy' as const,
        title: 'Salary-Based Budgeting Strategy',
        content: `
        For consumers with predictable salary income:

        50/30/20 Rule Foundation:
        - 50% Needs (housing, utilities, transportation, minimum debt payments)
        - 30% Wants (entertainment, dining out, hobbies)
        - 20% Savings & Debt Repayment

        Enhanced Envelope Allocation:
        1. Housing (25-30%) - rent/mortgage, insurance, taxes
        2. Transportation (10-15%) - car payment, gas, maintenance
        3. Food (10-15%) - groceries and dining
        4. Utilities (5-10%) - electricity, water, internet, phone
        5. Insurance (5%) - health, life, disability
        6. Emergency Fund (10-15%) - 3-6 months expenses
        7. Debt Repayment (5-15%) - credit cards, student loans
        8. Entertainment (5-10%) - movies, subscriptions, hobbies
        9. Personal Care (3-5%) - haircuts, healthcare
        10. Savings/Investments (5-10%) - retirement, goals

        Automation Strategy:
        - Set up automatic transfers on payday
        - Use direct deposit to fund multiple accounts
        - Schedule bill payments to avoid late fees
        `,
        category: 'strategy',
        subcategory: 'salary_based',
        metadata: {
          source: 'consumer_finance_guide',
          complexity: 'beginner' as const,
          userType: 'consumer' as const,
          tags: ['salary', 'predictable_income', '50_30_20', 'automation'],
          lastUpdated: new Date().toISOString(),
        }
      }
    ];

    for (const strategy of strategies) {
      await this.storeKnowledge(strategy);
    }
  }

  // Load creator-specific strategies
  private async loadCreatorStrategies(): Promise<void> {
    const strategies = [
      {
        id: 'multi_platform_income_strategy',
        type: 'creator_strategy' as const,
        title: 'Multi-Platform Income Management',
        content: `
        Strategy for creators earning from multiple platforms:

        Platform Income Tracking:
        - YouTube: Ad revenue, memberships, Super Chat
        - Twitch: Subscriptions, bits, donations
        - TikTok: Creator Fund, live gifts
        - Instagram: Reels Play Bonus, brand partnerships
        - Patreon: Monthly subscriptions
        - Affiliate Marketing: Commission-based earnings

        Income Smoothing Strategy:
        1. Calculate 3-month rolling average income
        2. Use lowest month as base budget
        3. Treat excess income as "bonus months"
        4. Build larger emergency fund (6-12 months)

        Envelope Structure for Creators:
        - Tax Savings (30-35%) - most important!
        - Emergency Fund (20-25%)
        - Equipment/Software (10-15%)
        - Business Expenses (5-10%)
        - Personal Living (40-50%)

        Quarterly Tax Planning:
        - Set aside 25-30% for federal taxes
        - Add 5-10% for state taxes (if applicable)
        - Pay estimated quarterly taxes
        - Track business mile and home office usage
        `,
        category: 'strategy',
        subcategory: 'multi_platform',
        metadata: {
          source: 'creator_economy_guide',
          complexity: 'advanced' as const,
          userType: 'creator' as const,
          tags: ['multi_platform', 'irregular_income', 'tax_planning', 'equipment'],
          lastUpdated: new Date().toISOString(),
        }
      }
    ];

    for (const strategy of strategies) {
      await this.storeKnowledge(strategy);
    }
  }

  // Load tithe-specific guidance
  private async loadTitheGuidance(): Promise<void> {
    const titheGuidance = [
      {
        id: 'tithe_budgeting_principles',
        type: 'financial_principle' as const,
        title: 'Incorporating Tithing into Envelope Budgeting',
        content: `
        Biblical and practical principles for tithing within envelope budgeting:

        Tithe Calculation Methods:
        1. Gross Income Tithing: 10% of total income before taxes
        2. Net Income Tithing: 10% of take-home pay
        3. First Fruits: Give first, then budget remaining income

        Envelope Integration:
        - Tithe Envelope: Auto-allocate 10% on income receipt
        - Make tithing the first "expense" in your budget
        - Consider tithing as non-negotiable fixed expense

        Practical Implementation:
        - Set up automatic transfer to tithing envelope
        - Schedule giving to align with church's needs
        - Track giving for tax deduction purposes
        - Consider stock or asset donations for tax efficiency

        Budgeting After Tithing:
        - Remaining 90% becomes your working budget
        - Adjust other envelope percentages accordingly
        - Housing: 22-27% (instead of 25-30%)
        - Transportation: 9-13% (instead of 10-15%)
        - All other categories scale proportionally

        Emergency Fund Considerations:
        - Some choose to tithe from emergency fund withdrawals
        - Others set aside tithe amount before building emergency fund
        - Discuss with spiritual advisor for personal guidance
        `,
        category: 'religious_finance',
        subcategory: 'tithing',
        metadata: {
          source: 'biblical_finance_principles',
          complexity: 'intermediate' as const,
          userType: 'all' as const,
          tags: ['tithe', 'religious', 'giving', 'first_fruits', 'biblical'],
          lastUpdated: new Date().toISOString(),
        }
      }
    ];

    for (const guidance of titheGuidance) {
      await this.storeKnowledge(guidance);
    }
  }

  // Store knowledge with embeddings
  private async storeKnowledge(knowledge: Omit<FinancialKnowledge, 'timestamp' | 'embedding'>): Promise<void> {
    if (!openai) {
      logger.warn('OpenAI not configured, skipping knowledge embedding');
      return;
    }

    try {
      // Generate embedding for semantic search
      const embedding = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: `${knowledge.title}\n\n${knowledge.content}`,
      });

      const knowledgeWithEmbedding: FinancialKnowledge = {
        ...knowledge,
        embedding: embedding.data[0].embedding,
        timestamp: new Date(),
      };

      // Store in cache
      const categoryKey = `${knowledge.category}_${knowledge.metadata.userType}`;
      const existing = this.knowledgeCache.get(categoryKey) || [];
      existing.push(knowledgeWithEmbedding);
      this.knowledgeCache.set(categoryKey, existing);

      logger.debug({ knowledgeId: knowledge.id, category: knowledge.category }, 'Knowledge stored in Global AI Brain');
    } catch (error) {
      logger.error({ error, knowledgeId: knowledge.id }, 'Failed to store knowledge');
    }
  }

  // Retrieve relevant knowledge for agent queries
  async getRelevantKnowledge(
    query: string,
    userType: 'consumer' | 'creator' | 'business' = 'consumer',
    category?: string,
    limit: number = 5
  ): Promise<FinancialKnowledge[]> {
    if (!openai) {
      // Return cached knowledge without semantic search
      return this.getCachedKnowledge(userType, category, limit);
    }

    try {
      // Generate query embedding
      const queryEmbedding = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
      });

      // Get all relevant knowledge
      const allKnowledge = this.getAllKnowledge(userType, category);

      // Calculate similarity scores
      const scoredKnowledge = allKnowledge
        .filter(k => k.embedding)
        .map(knowledge => ({
          ...knowledge,
          relevanceScore: this.cosineSimilarity(
            queryEmbedding.data[0].embedding,
            knowledge.embedding!
          )
        }))
        .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
        .slice(0, limit);

      logger.debug({
        query,
        userType,
        resultsCount: scoredKnowledge.length,
        topScore: scoredKnowledge[0]?.relevanceScore
      }, 'Retrieved relevant knowledge from Global AI Brain');

      return scoredKnowledge;
    } catch (error) {
      logger.error({ error, query }, 'Failed to retrieve relevant knowledge');
      return this.getCachedKnowledge(userType, category, limit);
    }
  }

  // Get cached knowledge without embeddings
  private getCachedKnowledge(
    userType: 'consumer' | 'creator' | 'business',
    category?: string,
    limit: number = 5
  ): FinancialKnowledge[] {
    const allKnowledge = this.getAllKnowledge(userType, category);
    return allKnowledge.slice(0, limit);
  }

  // Get all knowledge for user type and category
  private getAllKnowledge(userType: 'consumer' | 'creator' | 'business', category?: string): FinancialKnowledge[] {
    const allKnowledge: FinancialKnowledge[] = [];

    for (const [key, knowledgeList] of this.knowledgeCache.entries()) {
      for (const knowledge of knowledgeList) {
        // Filter by user type
        if (knowledge.metadata.userType !== 'all' && knowledge.metadata.userType !== userType) {
          continue;
        }

        // Filter by category if specified
        if (category && knowledge.category !== category) {
          continue;
        }

        allKnowledge.push(knowledge);
      }
    }

    return allKnowledge;
  }

  // Calculate cosine similarity between embeddings
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  // Get knowledge statistics
  getKnowledgeStats(): {
    totalKnowledge: number;
    byCategory: Record<string, number>;
    byUserType: Record<string, number>;
  } {
    let totalKnowledge = 0;
    const byCategory: Record<string, number> = {};
    const byUserType: Record<string, number> = {};

    for (const knowledgeList of this.knowledgeCache.values()) {
      for (const knowledge of knowledgeList) {
        totalKnowledge++;
        byCategory[knowledge.category] = (byCategory[knowledge.category] || 0) + 1;
        byUserType[knowledge.metadata.userType] = (byUserType[knowledge.metadata.userType] || 0) + 1;
      }
    }

    return { totalKnowledge, byCategory, byUserType };
  }
}

// Export singleton instance
export const globalAIBrain = new GlobalAIBrain();

// TODO: Implement vector storage for AI context and memory
// This will be used for storing user context, financial insights, and conversation history

export const globalAIBrain = {
  // Placeholder for global AI context
};

export const storeUserContext = async (userId: string, context: any) => {
  // TODO: Implement vector storage for user context
  console.log('Storing user context for user:', userId, context);
};

export const getUserContext = async (userId: string) => {
  // TODO: Implement vector retrieval for user context
  console.log('Getting user context for user:', userId);
  return null;
};


// Store user interactions for AI context (enhanced)
export async function storeUserMemory(
  userId: string,
  type: UserMemory['type'],
  content: string,
  metadata: any = {}
): Promise<UserMemory | null> {
  if (!openai) {
    logger.warn('OpenAI not configured, storing memory without embedding');
    return { userId, type, content, metadata, timestamp: new Date() };
  }

  try {
    // Generate embedding for semantic search
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: content
    });

    // TODO: Store in UserMemory table when schema is updated
    const memory: UserMemory = {
      userId,
      type,
      content,
      embedding: embedding.data[0].embedding,
      metadata: {
        ...metadata,
        storedAt: new Date().toISOString(),
      },
      timestamp: new Date()
    };

    logger.debug({ userId, type }, 'User memory stored with embedding');
    return memory;
  } catch (error) {
    logger.error({ error, userId, type }, 'Failed to store user memory');
    return null;
  }
}

// Retrieve relevant memories for AI context (enhanced)
export async function getUserContext(
  userId: string,
  query: string,
  userType: 'consumer' | 'creator' = 'consumer',
  limit: number = 5
): Promise<{ memories: UserMemory[]; knowledge: FinancialKnowledge[] }> {
  try {
    // Get relevant knowledge from Global AI Brain
    const relevantKnowledge = await globalAIBrain.getRelevantKnowledge(
      query,
      userType,
      undefined,
      Math.floor(limit / 2)
    );

    // Get user memories (simplified for now)
    const memories: UserMemory[] = [];

    // TODO: Implement user memory retrieval from database
    // For now, return knowledge-based context

    logger.debug({
      userId,
      query,
      userType,
      knowledgeCount: relevantKnowledge.length,
      memoryCount: memories.length
    }, 'Retrieved user context with knowledge and memories');

    return {
      memories,
      knowledge: relevantKnowledge
    };
  } catch (error) {
    logger.error({ error, userId, query }, 'Failed to retrieve user context');
    return { memories: [], knowledge: [] };
  }
}

// Enhanced bank statement analysis with Global AI Brain
export async function analyzeBankStatement(userId: string, transactions: any[]) {
  const patterns = {
    topMerchants: {} as Record<string, number>,
    categorySpending: {} as Record<string, number>,
    monthlyAverage: 0,
    spendingTrends: [] as string[],
    titheDetection: false,
    businessExpenseRatio: 0,
  };

  // Analyze transaction patterns
  transactions.forEach(txn => {
    const merchant = txn.merchant || 'Unknown';
    const amount = Math.abs(txn.amount || 0);
    const description = txn.description?.toLowerCase() || '';

    patterns.topMerchants[merchant] = (patterns.topMerchants[merchant] || 0) + amount;

    // Detect potential tithe/charitable giving
    if (description.includes('church') || description.includes('tithe') || 
        description.includes('donation') || description.includes('offering')) {
      patterns.titheDetection = true;
    }

    // Detect business expenses for creators
    if (description.includes('equipment') || description.includes('software') || 
        description.includes('camera') || description.includes('microphone')) {
      patterns.businessExpenseRatio += amount;
    }
  });

  patterns.monthlyAverage = transactions.reduce((sum, txn) => sum + Math.abs(txn.amount || 0), 0) / 12;
  patterns.businessExpenseRatio = patterns.businessExpenseRatio / (patterns.monthlyAverage * 12) * 100;

  // Get insights from Global AI Brain
  const userType = patterns.businessExpenseRatio > 5 ? 'creator' : 'consumer';
  const analysisQuery = `Analyze spending patterns: monthly average $${patterns.monthlyAverage.toFixed(2)}, business expenses ${patterns.businessExpenseRatio.toFixed(1)}%, tithe detected: ${patterns.titheDetection}`;

  const context = await getUserContext(userId, analysisQuery, userType, 3);

  // Store analysis as user memory
  await storeUserMemory(userId, 'spending_pattern', JSON.stringify(patterns), {
    source: 'bank_statement',
    transactionCount: transactions.length,
    userType,
    analysisDate: new Date().toISOString(),
    insights: context.knowledge.map(k => k.title)
  });

  return {
    patterns,
    userType,
    recommendations: context.knowledge,
    insights: context.knowledge.map(k => k.title)
  };
}
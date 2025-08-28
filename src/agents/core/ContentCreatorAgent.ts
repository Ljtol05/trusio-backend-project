
import { logger } from '../../lib/logger.js';
import { createAgentResponse } from '../../lib/openai.js';
import { db } from '../../lib/db.js';
import { globalAIBrain, storeUserContext, getUserContext } from '../../lib/vectorstore.js';
import type { FinancialContext } from '../tools/types.js';

export interface CreatorRevenue {
  platform: 'youtube' | 'twitch' | 'tiktok' | 'instagram' | 'patreon' | 'onlyfans' | 'substack' | 'other';
  revenueType: 'ad_revenue' | 'sponsorship' | 'subscription' | 'donation' | 'merchandise' | 'affiliate' | 'course_sales';
  amount: number;
  date: Date;
  description: string;
  verified: boolean;
}

export interface EquipmentExpense {
  category: 'camera' | 'audio' | 'lighting' | 'computer' | 'software' | 'storage' | 'networking' | 'accessories';
  item: string;
  cost: number;
  purchaseDate: Date;
  depreciationPeriod: number; // months
  businessUse: number; // percentage
  taxDeductible: boolean;
}

export interface CreatorInsight {
  type: 'revenue_trend' | 'platform_diversification' | 'equipment_roi' | 'tax_optimization' | 'income_stability';
  platform?: string;
  message: string;
  actionable: boolean;
  priority: 'low' | 'medium' | 'high';
  suggestedActions: string[];
  financialImpact?: number;
}

export interface IncomePattern {
  platform: string;
  averageMonthly: number;
  volatility: number; // coefficient of variation
  seasonality: string[];
  growthTrend: 'increasing' | 'decreasing' | 'stable';
  reliability: 'high' | 'medium' | 'low';
}

class ContentCreatorAgent {
  private readonly systemPrompt = `
You are an expert AI Financial Advisor specializing in content creator finances.

Your expertise includes:
1. MULTI-PLATFORM REVENUE TRACKING: YouTube, Twitch, TikTok, Instagram, Patreon, OnlyFans, etc.
2. IRREGULAR INCOME MANAGEMENT: Cash flow forecasting, emergency fund sizing, income smoothing
3. EQUIPMENT EXPENSE CATEGORIZATION: Business use percentage, depreciation, tax deductions
4. TAX OPTIMIZATION: Self-employment tax, quarterly estimates, business expense tracking
5. PLATFORM DIVERSIFICATION: Risk assessment, revenue optimization strategies
6. CREATOR-SPECIFIC INSIGHTS: ROI analysis, growth opportunities, financial planning

Key Focus Areas:
- Help creators understand their true monthly income despite irregular payments
- Optimize tax deductions for equipment and business expenses
- Plan for seasonal income variations and platform algorithm changes
- Build sustainable financial habits for unpredictable income streams
- Identify opportunities for revenue diversification and growth

Communication Style:
- Use creator-friendly language and examples
- Reference platform-specific scenarios (sponsorship cycles, monetization thresholds)
- Focus on actionable advice for building financial stability
- Acknowledge the unique challenges of creator economy finances
`;

  async analyzeCreatorFinances(
    userId: string,
    context: FinancialContext
  ): Promise<{
    revenueAnalysis: any;
    platformDiversification: any;
    equipmentROI: any;
    incomeStability: any;
    taxOptimization: any;
    insights: CreatorInsight[];
  }> {
    try {
      logger.info({ userId }, 'Starting creator financial analysis');

      // Get creator-specific data
      const revenueStreams = await this.analyzeRevenueStreams(userId);
      const equipmentExpenses = await this.analyzeEquipmentExpenses(userId);
      const incomePatterns = await this.analyzeIncomePatterns(userId, context);
      
      // Platform diversification analysis
      const platformAnalysis = this.analyzePlatformDiversification(revenueStreams);
      
      // Equipment ROI analysis
      const equipmentROI = this.analyzeEquipmentROI(equipmentExpenses, revenueStreams);
      
      // Income stability assessment
      const stabilityAnalysis = this.analyzeIncomeStability(incomePatterns);
      
      // Tax optimization opportunities
      const taxOptimization = await this.analyzeTaxOptimization(equipmentExpenses, revenueStreams);
      
      // Generate creator-specific insights
      const insights = await this.generateCreatorInsights(
        revenueStreams,
        equipmentExpenses,
        incomePatterns,
        platformAnalysis,
        context
      );

      return {
        revenueAnalysis: {
          totalMonthly: revenueStreams.reduce((sum, r) => sum + r.amount, 0),
          platformBreakdown: this.groupRevenueByPlatform(revenueStreams),
          revenueTypeBreakdown: this.groupRevenueByType(revenueStreams),
          growthTrend: this.calculateGrowthTrend(revenueStreams),
        },
        platformDiversification: platformAnalysis,
        equipmentROI,
        incomeStability: stabilityAnalysis,
        taxOptimization,
        insights,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Creator financial analysis failed');
      throw error;
    }
  }

  private async analyzeRevenueStreams(userId: string): Promise<CreatorRevenue[]> {
    // Get transactions that look like creator revenue
    const transactions = await db.transaction.findMany({
      where: { 
        userId,
        amountCents: { lt: 0 }, // Negative amounts are income in Plaid
        createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } // Last 90 days
      },
      orderBy: { createdAt: 'desc' }
    });

    const revenueStreams: CreatorRevenue[] = [];

    for (const transaction of transactions) {
      const platform = this.identifyPlatform(transaction.description, transaction.merchantName);
      const revenueType = this.identifyRevenueType(transaction.description, transaction.merchantName);
      
      if (platform && revenueType) {
        revenueStreams.push({
          platform,
          revenueType,
          amount: Math.abs(transaction.amountCents) / 100,
          date: transaction.createdAt,
          description: transaction.description,
          verified: this.verifyCreatorRevenue(transaction.description, transaction.merchantName),
        });
      }
    }

    return revenueStreams;
  }

  private async analyzeEquipmentExpenses(userId: string): Promise<EquipmentExpense[]> {
    const transactions = await db.transaction.findMany({
      where: { 
        userId,
        amountCents: { gt: 0 }, // Positive amounts are expenses
        createdAt: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } // Last year
      }
    });

    const equipmentExpenses: EquipmentExpense[] = [];

    for (const transaction of transactions) {
      const category = this.identifyEquipmentCategory(transaction.description, transaction.merchantName);
      
      if (category) {
        equipmentExpenses.push({
          category,
          item: transaction.description,
          cost: transaction.amountCents / 100,
          purchaseDate: transaction.createdAt,
          depreciationPeriod: this.getDepreciationPeriod(category),
          businessUse: this.estimateBusinessUse(category, transaction.description),
          taxDeductible: true,
        });
      }
    }

    return equipmentExpenses;
  }

  private async analyzeIncomePatterns(userId: string, context: FinancialContext): Promise<IncomePattern[]> {
    const revenueStreams = await this.analyzeRevenueStreams(userId);
    const platformGroups = this.groupRevenueByPlatform(revenueStreams);
    
    const patterns: IncomePattern[] = [];

    for (const [platform, revenues] of Object.entries(platformGroups)) {
      const monthlyAmounts = this.getMonthlyAmounts(revenues as CreatorRevenue[]);
      const average = monthlyAmounts.reduce((sum, amt) => sum + amt, 0) / monthlyAmounts.length;
      const volatility = this.calculateVolatility(monthlyAmounts, average);
      
      patterns.push({
        platform,
        averageMonthly: average,
        volatility,
        seasonality: this.identifySeasonality(revenues as CreatorRevenue[]),
        growthTrend: this.calculatePlatformTrend(revenues as CreatorRevenue[]),
        reliability: volatility < 0.3 ? 'high' : volatility < 0.6 ? 'medium' : 'low',
      });
    }

    return patterns;
  }

  private identifyPlatform(description: string, merchant?: string): CreatorRevenue['platform'] | null {
    const text = `${description} ${merchant || ''}`.toLowerCase();
    
    if (text.includes('youtube') || text.includes('google adsense')) return 'youtube';
    if (text.includes('twitch') || text.includes('amazon twitch')) return 'twitch';
    if (text.includes('tiktok') || text.includes('tik tok')) return 'tiktok';
    if (text.includes('instagram') || text.includes('meta')) return 'instagram';
    if (text.includes('patreon')) return 'patreon';
    if (text.includes('onlyfans')) return 'onlyfans';
    if (text.includes('substack')) return 'substack';
    
    // Check for common creator payment processors
    if (text.includes('stripe') || text.includes('paypal') || text.includes('venmo')) {
      return 'other'; // Could be from various platforms
    }
    
    return null;
  }

  private identifyRevenueType(description: string, merchant?: string): CreatorRevenue['revenueType'] | null {
    const text = `${description} ${merchant || ''}`.toLowerCase();
    
    if (text.includes('adsense') || text.includes('ad revenue')) return 'ad_revenue';
    if (text.includes('sponsor') || text.includes('brand') || text.includes('collab')) return 'sponsorship';
    if (text.includes('subscription') || text.includes('member') || text.includes('tier')) return 'subscription';
    if (text.includes('donation') || text.includes('tip') || text.includes('superchat')) return 'donation';
    if (text.includes('merch') || text.includes('merchandise') || text.includes('store')) return 'merchandise';
    if (text.includes('affiliate') || text.includes('commission')) return 'affiliate';
    if (text.includes('course') || text.includes('coaching') || text.includes('consultation')) return 'course_sales';
    
    return 'other' as any;
  }

  private identifyEquipmentCategory(description: string, merchant?: string): EquipmentExpense['category'] | null {
    const text = `${description} ${merchant || ''}`.toLowerCase();
    
    // Camera equipment
    if (text.includes('camera') || text.includes('lens') || text.includes('canon') || 
        text.includes('sony') || text.includes('nikon') || text.includes('gopro')) return 'camera';
    
    // Audio equipment
    if (text.includes('microphone') || text.includes('mic') || text.includes('audio') || 
        text.includes('rode') || text.includes('shure') || text.includes('blue yeti')) return 'audio';
    
    // Lighting
    if (text.includes('light') || text.includes('led') || text.includes('softbox') || 
        text.includes('ring light') || text.includes('godox')) return 'lighting';
    
    // Computer equipment
    if (text.includes('macbook') || text.includes('imac') || text.includes('pc') || 
        text.includes('laptop') || text.includes('processor') || text.includes('graphics card')) return 'computer';
    
    // Software
    if (text.includes('adobe') || text.includes('final cut') || text.includes('software') || 
        text.includes('subscription') || text.includes('license')) return 'software';
    
    // Storage
    if (text.includes('hard drive') || text.includes('ssd') || text.includes('storage') || 
        text.includes('cloud') || text.includes('dropbox')) return 'storage';
    
    return null;
  }

  private getDepreciationPeriod(category: EquipmentExpense['category']): number {
    const periods = {
      camera: 60, // 5 years
      audio: 60,
      lighting: 36, // 3 years
      computer: 36,
      software: 12, // 1 year
      storage: 36,
      networking: 60,
      accessories: 24, // 2 years
    };
    
    return periods[category] || 36;
  }

  private estimateBusinessUse(category: EquipmentExpense['category'], description: string): number {
    // Professional creators typically use 80-100% for business
    // This could be made more sophisticated with user input
    const businessUseMap = {
      camera: 85,
      audio: 90,
      lighting: 95,
      computer: 75, // Computers used for personal stuff too
      software: 95,
      storage: 80,
      networking: 70,
      accessories: 85,
    };
    
    return businessUseMap[category] || 80;
  }

  private analyzePlatformDiversification(revenues: CreatorRevenue[]) {
    const platformGroups = this.groupRevenueByPlatform(revenues);
    const totalRevenue = revenues.reduce((sum, r) => sum + r.amount, 0);
    
    const diversification = Object.entries(platformGroups).map(([platform, platformRevenues]) => {
      const platformTotal = (platformRevenues as CreatorRevenue[]).reduce((sum, r) => sum + r.amount, 0);
      return {
        platform,
        revenue: platformTotal,
        percentage: (platformTotal / totalRevenue) * 100,
        riskLevel: this.assessPlatformRisk(platform as CreatorRevenue['platform']),
      };
    });

    // Calculate diversification score (higher is better)
    const concentrationRisk = Math.max(...diversification.map(p => p.percentage));
    const diversificationScore = 100 - concentrationRisk;

    return {
      platforms: diversification,
      diversificationScore,
      recommendation: this.getDiversificationRecommendation(diversificationScore, diversification),
    };
  }

  private analyzeEquipmentROI(equipment: EquipmentExpense[], revenues: CreatorRevenue[]) {
    const totalEquipmentCost = equipment.reduce((sum, e) => sum + e.cost, 0);
    const totalRevenue = revenues.reduce((sum, r) => sum + r.amount, 0);
    
    // Simple ROI calculation - more sophisticated analysis could consider depreciation
    const monthlyROI = totalRevenue > 0 ? (totalRevenue * 12) / totalEquipmentCost : 0;
    
    const categoryBreakdown = equipment.reduce((acc, e) => {
      if (!acc[e.category]) acc[e.category] = { cost: 0, items: 0 };
      acc[e.category].cost += e.cost;
      acc[e.category].items += 1;
      return acc;
    }, {} as Record<string, { cost: number; items: number }>);

    return {
      totalInvestment: totalEquipmentCost,
      monthlyROI,
      annualROI: monthlyROI * 12,
      categoryBreakdown,
      recommendations: this.getEquipmentRecommendations(categoryBreakdown, monthlyROI),
    };
  }

  private analyzeIncomeStability(patterns: IncomePattern[]) {
    const totalIncome = patterns.reduce((sum, p) => sum + p.averageMonthly, 0);
    const weightedVolatility = patterns.reduce((sum, p) => 
      sum + (p.volatility * (p.averageMonthly / totalIncome)), 0
    );

    const stabilityScore = Math.max(0, 100 - (weightedVolatility * 100));
    
    return {
      stabilityScore,
      averageMonthlyIncome: totalIncome,
      volatility: weightedVolatility,
      mostStablePlatform: patterns.sort((a, b) => a.volatility - b.volatility)[0]?.platform,
      recommendations: this.getStabilityRecommendations(stabilityScore, patterns),
    };
  }

  private async analyzeTaxOptimization(equipment: EquipmentExpense[], revenues: CreatorRevenue[]) {
    const annualRevenue = revenues.reduce((sum, r) => sum + r.amount, 0) * 12;
    const deductibleEquipment = equipment.filter(e => e.taxDeductible);
    const totalDeductions = deductibleEquipment.reduce((sum, e) => 
      sum + (e.cost * e.businessUse / 100), 0
    );

    // Estimate tax savings (simplified calculation)
    const estimatedTaxRate = annualRevenue > 100000 ? 0.30 : annualRevenue > 50000 ? 0.25 : 0.20;
    const taxSavings = totalDeductions * estimatedTaxRate;

    return {
      annualRevenue,
      totalDeductions,
      estimatedTaxSavings: taxSavings,
      quarterlyEstimate: (annualRevenue * estimatedTaxRate) / 4,
      recommendations: [
        'Track all business expenses throughout the year',
        'Set aside 25-30% of revenue for taxes',
        'Consider quarterly tax payments to avoid penalties',
        'Keep detailed records of equipment business use',
        'Consult with a tax professional familiar with creator economy',
      ],
    };
  }

  private async generateCreatorInsights(
    revenues: CreatorRevenue[],
    equipment: EquipmentExpense[],
    patterns: IncomePattern[],
    platformAnalysis: any,
    context: FinancialContext
  ): Promise<CreatorInsight[]> {
    const insights: CreatorInsight[] = [];

    // Revenue diversification insights
    if (platformAnalysis.diversificationScore < 50) {
      insights.push({
        type: 'platform_diversification',
        message: `Your revenue is heavily concentrated on one platform (${platformAnalysis.platforms[0]?.platform}). Consider diversifying to reduce risk.`,
        actionable: true,
        priority: 'high',
        suggestedActions: [
          'Start posting content on 2-3 additional platforms',
          'Develop direct revenue streams (email list, courses)',
          'Build a personal brand beyond any single platform',
        ],
      });
    }

    // Income stability insights
    const volatility = patterns.reduce((sum, p) => sum + p.volatility, 0) / patterns.length;
    if (volatility > 0.5) {
      insights.push({
        type: 'income_stability',
        message: 'Your income shows high volatility. Building a larger emergency fund is crucial.',
        actionable: true,
        priority: 'high',
        suggestedActions: [
          'Maintain 6-12 months of expenses in emergency fund',
          'Focus on building recurring revenue streams',
          'Track income patterns to predict seasonal variations',
        ],
      });
    }

    // Equipment ROI insights
    const equipmentCost = equipment.reduce((sum, e) => sum + e.cost, 0);
    const monthlyRevenue = revenues.reduce((sum, r) => sum + r.amount, 0);
    if (equipmentCost > monthlyRevenue * 6) {
      insights.push({
        type: 'equipment_roi',
        message: 'Your equipment investment is high relative to current revenue. Focus on monetization.',
        actionable: true,
        priority: 'medium',
        suggestedActions: [
          'Prioritize revenue-generating activities over new equipment',
          'Consider renting expensive equipment for occasional use',
          'Track which equipment directly impacts revenue',
        ],
        financialImpact: equipmentCost,
      });
    }

    return insights;
  }

  // Helper methods
  private groupRevenueByPlatform(revenues: CreatorRevenue[]) {
    return revenues.reduce((acc, revenue) => {
      if (!acc[revenue.platform]) acc[revenue.platform] = [];
      acc[revenue.platform].push(revenue);
      return acc;
    }, {} as Record<string, CreatorRevenue[]>);
  }

  private groupRevenueByType(revenues: CreatorRevenue[]) {
    return revenues.reduce((acc, revenue) => {
      if (!acc[revenue.revenueType]) acc[revenue.revenueType] = [];
      acc[revenue.revenueType].push(revenue);
      return acc;
    }, {} as Record<string, CreatorRevenue[]>);
  }

  private calculateGrowthTrend(revenues: CreatorRevenue[]): 'increasing' | 'decreasing' | 'stable' {
    if (revenues.length < 4) return 'stable';
    
    const sortedRevenues = revenues.sort((a, b) => a.date.getTime() - b.date.getTime());
    const firstHalf = sortedRevenues.slice(0, Math.floor(sortedRevenues.length / 2));
    const secondHalf = sortedRevenues.slice(Math.floor(sortedRevenues.length / 2));
    
    const firstHalfAvg = firstHalf.reduce((sum, r) => sum + r.amount, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, r) => sum + r.amount, 0) / secondHalf.length;
    
    const growthRate = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;
    
    if (growthRate > 0.1) return 'increasing';
    if (growthRate < -0.1) return 'decreasing';
    return 'stable';
  }

  private getMonthlyAmounts(revenues: CreatorRevenue[]): number[] {
    const monthlyTotals: Record<string, number> = {};
    
    revenues.forEach(revenue => {
      const monthKey = `${revenue.date.getFullYear()}-${revenue.date.getMonth()}`;
      monthlyTotals[monthKey] = (monthlyTotals[monthKey] || 0) + revenue.amount;
    });
    
    return Object.values(monthlyTotals);
  }

  private calculateVolatility(amounts: number[], average: number): number {
    if (amounts.length < 2) return 0;
    
    const variance = amounts.reduce((sum, amount) => sum + Math.pow(amount - average, 2), 0) / amounts.length;
    const standardDeviation = Math.sqrt(variance);
    
    return average > 0 ? standardDeviation / average : 0; // Coefficient of variation
  }

  private identifySeasonality(revenues: CreatorRevenue[]): string[] {
    // Simplified seasonality detection
    const monthlyData: Record<number, number> = {};
    
    revenues.forEach(revenue => {
      const month = revenue.date.getMonth();
      monthlyData[month] = (monthlyData[month] || 0) + revenue.amount;
    });
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const average = Object.values(monthlyData).reduce((sum, val) => sum + val, 0) / Object.keys(monthlyData).length;
    
    return Object.entries(monthlyData)
      .filter(([_, amount]) => amount > average * 1.2)
      .map(([monthIndex, _]) => months[parseInt(monthIndex)])
      .sort();
  }

  private calculatePlatformTrend(revenues: CreatorRevenue[]): 'increasing' | 'decreasing' | 'stable' {
    return this.calculateGrowthTrend(revenues);
  }

  private assessPlatformRisk(platform: CreatorRevenue['platform']): 'low' | 'medium' | 'high' {
    const riskMap = {
      youtube: 'medium', // Algorithm changes, demonetization
      twitch: 'medium',
      tiktok: 'high', // Potential bans, regulatory issues
      instagram: 'medium',
      patreon: 'low', // Direct fan support
      onlyfans: 'medium',
      substack: 'low',
      other: 'medium',
    };
    
    return riskMap[platform] || 'medium';
  }

  private getDiversificationRecommendation(score: number, platforms: any[]): string {
    if (score < 30) return 'Critical: Over 70% revenue from one platform. Urgent diversification needed.';
    if (score < 50) return 'High Risk: Consider expanding to additional platforms or revenue streams.';
    if (score < 70) return 'Moderate Risk: Good diversification, but room for improvement.';
    return 'Well Diversified: Excellent platform spread reduces risk.';
  }

  private getEquipmentRecommendations(breakdown: any, roi: number): string[] {
    const recommendations: string[] = [];
    
    if (roi < 2) {
      recommendations.push('Focus on revenue generation before major equipment purchases');
      recommendations.push('Consider renting equipment for special projects');
    }
    
    if (breakdown.camera && breakdown.camera.cost > 10000) {
      recommendations.push('High camera investment - ensure you\'re maximizing video content production');
    }
    
    if (!breakdown.audio || breakdown.audio.cost < 500) {
      recommendations.push('Audio quality is crucial - consider investing in better microphones');
    }
    
    return recommendations;
  }

  private getStabilityRecommendations(score: number, patterns: IncomePattern[]): string[] {
    const recommendations: string[] = [];
    
    if (score < 50) {
      recommendations.push('Build 6-12 months emergency fund due to income volatility');
      recommendations.push('Focus on recurring revenue streams (subscriptions, memberships)');
    }
    
    const unreliablePlatforms = patterns.filter(p => p.reliability === 'low');
    if (unreliablePlatforms.length > 0) {
      recommendations.push(`Reduce dependence on volatile platforms: ${unreliablePlatforms.map(p => p.platform).join(', ')}`);
    }
    
    recommendations.push('Track income patterns to identify seasonal trends');
    recommendations.push('Consider diversifying into more stable revenue streams');
    
    return recommendations;
  }

  private verifyCreatorRevenue(description: string, merchant?: string): boolean {
    // Simple verification - in production, this could be more sophisticated
    const text = `${description} ${merchant || ''}`.toLowerCase();
    const knownPlatforms = ['youtube', 'twitch', 'tiktok', 'instagram', 'patreon', 'onlyfans', 'substack'];
    return knownPlatforms.some(platform => text.includes(platform));
  }

  // Public methods
  async getCreatorInsights(userId: string, context: FinancialContext): Promise<CreatorInsight[]> {
    const analysis = await this.analyzeCreatorFinances(userId, context);
    return analysis.insights;
  }

  async generateCreatorAdvice(
    userId: string,
    query: string,
    context: FinancialContext
  ): Promise<string> {
    try {
      const analysis = await this.analyzeCreatorFinances(userId, context);
      
      const advisorPrompt = `
      Creator Financial Profile:
      - Total Monthly Revenue: $${analysis.revenueAnalysis.totalMonthly.toFixed(2)}
      - Platform Diversification Score: ${analysis.platformDiversification.diversificationScore}/100
      - Income Stability Score: ${analysis.incomeStability.stabilityScore}/100
      - Equipment Investment: $${analysis.equipmentROI.totalInvestment.toFixed(2)}
      - Equipment ROI: ${analysis.equipmentROI.monthlyROI.toFixed(1)}x monthly

      Revenue Breakdown:
      ${Object.entries(analysis.revenueAnalysis.platformBreakdown)
        .map(([platform, revenues]: [string, any]) => 
          `- ${platform}: $${(revenues as any[]).reduce((sum: number, r: any) => sum + r.amount, 0).toFixed(2)}`
        ).join('\n')}

      Recent Insights:
      ${analysis.insights.map(i => `- ${i.message}`).join('\n')}

      User Query: "${query}"

      Provide creator-specific financial advice that:
      1. Addresses their specific query in context of their creator finances
      2. References their actual revenue streams and patterns
      3. Considers the unique challenges of creator economy
      4. Provides actionable, practical advice
      5. Uses creator-friendly language and examples

      Be encouraging but realistic about the financial realities of content creation.
      `;

      return await createAgentResponse(
        this.systemPrompt,
        advisorPrompt,
        [],
        { temperature: 0.7, useAdvancedModel: true }
      );
    } catch (error) {
      logger.error({ error, userId }, 'Creator advice generation failed');
      throw error;
    }
  }
}

export const contentCreatorAgent = new ContentCreatorAgent();

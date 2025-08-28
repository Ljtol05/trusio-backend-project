
import { logger } from './logger.js';

export interface MCCCategory {
  code: string;
  description: string;
  category: string;
  subcategory?: string;
  envelopeCategories: string[];
  titheApplicable?: boolean;
}

export interface TransactionSuggestion {
  envelopeId: string;
  envelopeName: string;
  category: string;
  confidence: number;
  reason: string;
  percentage?: number;
}

export interface SplitSuggestion {
  splits: Array<{
    envelopeId: string;
    envelopeName: string;
    percentage: number;
    amount: number;
    reason: string;
  }>;
  totalPercentage: number;
}

class MCCDatabase {
  private readonly mccData: Record<string, MCCCategory> = {
    // Grocery & Food
    '5411': {
      code: '5411',
      description: 'Grocery Stores, Supermarkets',
      category: 'food',
      subcategory: 'groceries',
      envelopeCategories: ['food', 'groceries', 'necessities'],
      titheApplicable: true,
    },
    '5499': {
      code: '5499',
      description: 'Miscellaneous Food Stores',
      category: 'food',
      subcategory: 'specialty',
      envelopeCategories: ['food', 'groceries'],
      titheApplicable: true,
    },
    '5812': {
      code: '5812',
      description: 'Eating Places, Restaurants',
      category: 'food',
      subcategory: 'dining',
      envelopeCategories: ['dining', 'entertainment', 'personal'],
    },
    '5814': {
      code: '5814',
      description: 'Fast Food Restaurants',
      category: 'food',
      subcategory: 'fastfood',
      envelopeCategories: ['dining', 'fastfood', 'personal'],
    },

    // Transportation
    '5541': {
      code: '5541',
      description: 'Service Stations (with or without Ancillary Services)',
      category: 'transportation',
      subcategory: 'fuel',
      envelopeCategories: ['transportation', 'gas', 'fuel'],
    },
    '5542': {
      code: '5542',
      description: 'Automated Fuel Dispensers',
      category: 'transportation',
      subcategory: 'fuel',
      envelopeCategories: ['transportation', 'gas'],
    },
    '7538': {
      code: '7538',
      description: 'Automotive Service Shops',
      category: 'transportation',
      subcategory: 'maintenance',
      envelopeCategories: ['transportation', 'maintenance'],
    },

    // Housing & Utilities
    '4900': {
      code: '4900',
      description: 'Utilities - Electric, Gas, Water, Sanitary',
      category: 'housing',
      subcategory: 'utilities',
      envelopeCategories: ['housing', 'utilities', 'bills'],
    },
    '7230': {
      code: '7230',
      description: 'Beauty and Barber Shops',
      category: 'personal',
      subcategory: 'care',
      envelopeCategories: ['personal', 'care'],
    },

    // Entertainment & Personal
    '5732': {
      code: '5732',
      description: 'Electronics Stores',
      category: 'electronics',
      subcategory: 'retail',
      envelopeCategories: ['electronics', 'equipment', 'personal'],
    },
    '5999': {
      code: '5999',
      description: 'Miscellaneous and Specialty Retail Stores',
      category: 'retail',
      subcategory: 'miscellaneous',
      envelopeCategories: ['personal', 'miscellaneous'],
    },

    // Business & Creator Expenses
    '5734': {
      code: '5734',
      description: 'Computer Software Stores',
      category: 'business',
      subcategory: 'software',
      envelopeCategories: ['equipment', 'software', 'business'],
    },
    '7372': {
      code: '7372',
      description: 'Computer Programming, Data Processing',
      category: 'business',
      subcategory: 'services',
      envelopeCategories: ['business', 'services'],
    },

    // Religious & Charitable
    '8661': {
      code: '8661',
      description: 'Religious Organizations',
      category: 'giving',
      subcategory: 'religious',
      envelopeCategories: ['giving', 'tithe', 'charitable'],
      titheApplicable: true,
    },
    '8398': {
      code: '8398',
      description: 'Charitable and Social Service Organizations',
      category: 'giving',
      subcategory: 'charitable',
      envelopeCategories: ['giving', 'charitable'],
    },
  };

  getMCCInfo(mccCode: string): MCCCategory | null {
    return this.mccData[mccCode] || null;
  }

  async generateTransactionSuggestions(
    transaction: {
      merchant: string;
      amount: number;
      mcc?: string;
      location?: string;
    },
    userEnvelopes: Array<{
      id: string;
      name: string;
      category?: string;
      balance: number;
    }>,
    userProfile: {
      hasTitheEnvelope: boolean;
      userType: 'consumer' | 'creator' | 'hybrid';
    }
  ): Promise<{
    suggestions: TransactionSuggestion[];
    splitSuggestion?: SplitSuggestion;
    canSplit: boolean;
  }> {
    try {
      logger.info({
        merchant: transaction.merchant,
        mcc: transaction.mcc,
        amount: transaction.amount
      }, 'Generating transaction suggestions');

      const suggestions: TransactionSuggestion[] = [];
      let splitSuggestion: SplitSuggestion | undefined;

      // Get MCC information
      const mccInfo = transaction.mcc ? this.getMCCInfo(transaction.mcc) : null;
      
      // Analyze merchant name for additional context
      const merchantContext = this.analyzeMerchantName(transaction.merchant);
      
      // Generate primary suggestions based on MCC and merchant analysis
      const primaryCategories = this.determinePrimaryCategories(mccInfo, merchantContext);
      
      // Match with user envelopes
      for (const category of primaryCategories) {
        const matchingEnvelopes = this.findMatchingEnvelopes(category, userEnvelopes);
        
        for (const envelope of matchingEnvelopes.slice(0, 2)) { // Top 2 matches per category
          suggestions.push({
            envelopeId: envelope.id,
            envelopeName: envelope.name,
            category: category,
            confidence: this.calculateConfidence(mccInfo, merchantContext, envelope),
            reason: this.generateReason(mccInfo, merchantContext, envelope),
          });
        }
      }

      // Sort by confidence and take top 3
      suggestions.sort((a, b) => b.confidence - a.confidence);
      const topSuggestions = suggestions.slice(0, 3);

      // Generate split suggestion for applicable transactions
      const canSplit = this.canTransactionBeSplit(transaction, mccInfo, userProfile);
      if (canSplit) {
        splitSuggestion = await this.generateSplitSuggestion(
          transaction,
          mccInfo,
          userEnvelopes,
          userProfile
        );
      }

      return {
        suggestions: topSuggestions,
        splitSuggestion,
        canSplit,
      };

    } catch (error) {
      logger.error({ error, transaction }, 'Failed to generate transaction suggestions');
      throw error;
    }
  }

  private analyzeMerchantName(merchant: string): {
    keywords: string[];
    suggestedCategory: string;
    confidence: number;
  } {
    const merchantLower = merchant.toLowerCase();
    
    // Merchant keyword patterns
    const patterns = [
      { keywords: ['kroger', 'walmart', 'target', 'grocery', 'market'], category: 'groceries', confidence: 0.9 },
      { keywords: ['mcdonald', 'burger', 'pizza', 'restaurant', 'cafe'], category: 'dining', confidence: 0.85 },
      { keywords: ['shell', 'bp', 'exxon', 'gas', 'fuel'], category: 'transportation', confidence: 0.9 },
      { keywords: ['amazon', 'best buy', 'electronics'], category: 'personal', confidence: 0.7 },
      { keywords: ['church', 'ministry', 'chapel', 'cathedral'], category: 'giving', confidence: 0.95 },
      { keywords: ['adobe', 'microsoft', 'software', 'saas'], category: 'business', confidence: 0.8 },
    ];

    for (const pattern of patterns) {
      const matchingKeywords = pattern.keywords.filter(keyword => 
        merchantLower.includes(keyword)
      );
      
      if (matchingKeywords.length > 0) {
        return {
          keywords: matchingKeywords,
          suggestedCategory: pattern.category,
          confidence: pattern.confidence,
        };
      }
    }

    return {
      keywords: [],
      suggestedCategory: 'personal',
      confidence: 0.3,
    };
  }

  private determinePrimaryCategories(
    mccInfo: MCCCategory | null,
    merchantContext: any
  ): string[] {
    const categories = new Set<string>();

    // Add MCC-based categories
    if (mccInfo) {
      mccInfo.envelopeCategories.forEach(cat => categories.add(cat));
    }

    // Add merchant-based category
    categories.add(merchantContext.suggestedCategory);

    // Add fallback categories
    categories.add('personal');
    categories.add('miscellaneous');

    return Array.from(categories);
  }

  private findMatchingEnvelopes(
    category: string,
    envelopes: Array<{ id: string; name: string; category?: string; balance: number }>
  ): Array<{ id: string; name: string; category?: string; balance: number; score: number }> {
    return envelopes
      .map(envelope => ({
        ...envelope,
        score: this.calculateEnvelopeMatchScore(category, envelope),
      }))
      .filter(envelope => envelope.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  private calculateEnvelopeMatchScore(
    category: string,
    envelope: { name: string; category?: string }
  ): number {
    let score = 0;
    const nameLower = envelope.name.toLowerCase();
    const categoryLower = category.toLowerCase();

    // Exact category match
    if (envelope.category === category) {
      score += 1.0;
    }

    // Name contains category
    if (nameLower.includes(categoryLower)) {
      score += 0.8;
    }

    // Specific keyword matching
    const keywordMatches = {
      'groceries': ['grocery', 'groceries', 'food'],
      'dining': ['dining', 'restaurant', 'food'],
      'transportation': ['gas', 'fuel', 'transport', 'car'],
      'housing': ['housing', 'rent', 'utilities', 'bills'],
      'giving': ['tithe', 'giving', 'church', 'charity'],
      'business': ['business', 'equipment', 'software'],
    };

    const keywords = keywordMatches[category] || [category];
    for (const keyword of keywords) {
      if (nameLower.includes(keyword)) {
        score += 0.6;
      }
    }

    return score;
  }

  private calculateConfidence(
    mccInfo: MCCCategory | null,
    merchantContext: any,
    envelope: any
  ): number {
    let confidence = 0.5; // Base confidence

    // MCC-based confidence
    if (mccInfo && envelope.score > 0.8) {
      confidence += 0.3;
    }

    // Merchant analysis confidence
    confidence += merchantContext.confidence * 0.4;

    // Envelope match confidence
    confidence += envelope.score * 0.3;

    return Math.min(confidence, 1.0);
  }

  private generateReason(
    mccInfo: MCCCategory | null,
    merchantContext: any,
    envelope: any
  ): string {
    if (mccInfo && envelope.score > 0.8) {
      return `Based on merchant category (${mccInfo.description}) and envelope match`;
    }
    
    if (merchantContext.keywords.length > 0) {
      return `Merchant keywords suggest ${merchantContext.suggestedCategory} category`;
    }
    
    return `Based on envelope name similarity`;
  }

  private canTransactionBeSplit(
    transaction: any,
    mccInfo: MCCCategory | null,
    userProfile: any
  ): boolean {
    // Grocery stores are prime candidates for splitting
    if (mccInfo?.code === '5411' && userProfile.hasTitheEnvelope) {
      return true;
    }

    // Large transactions can often be split
    if (transaction.amount > 100) {
      return true;
    }

    // Business expenses for creators
    if (userProfile.userType !== 'consumer' && 
        (mccInfo?.category === 'business' || mccInfo?.category === 'electronics')) {
      return true;
    }

    return false;
  }

  private async generateSplitSuggestion(
    transaction: any,
    mccInfo: MCCCategory | null,
    userEnvelopes: any[],
    userProfile: any
  ): Promise<SplitSuggestion> {
    const splits = [];
    const amount = transaction.amount;

    // Tithe split for applicable transactions
    if (userProfile.hasTitheEnvelope && mccInfo?.titheApplicable) {
      const titheEnvelope = userEnvelopes.find(env => 
        env.category === 'giving' || env.name.toLowerCase().includes('tithe')
      );
      
      if (titheEnvelope) {
        splits.push({
          envelopeId: titheEnvelope.id,
          envelopeName: titheEnvelope.name,
          percentage: 10,
          amount: amount * 0.1,
          reason: 'Automatic tithe allocation (10%)',
        });
      }
    }

    // Primary category split
    const primaryEnvelope = this.findBestMatchingEnvelope(mccInfo, userEnvelopes);
    if (primaryEnvelope) {
      const remainingPercentage = 100 - splits.reduce((sum, split) => sum + split.percentage, 0);
      splits.push({
        envelopeId: primaryEnvelope.id,
        envelopeName: primaryEnvelope.name,
        percentage: remainingPercentage,
        amount: amount * (remainingPercentage / 100),
        reason: `Primary expense category`,
      });
    }

    return {
      splits,
      totalPercentage: splits.reduce((sum, split) => sum + split.percentage, 0),
    };
  }

  private findBestMatchingEnvelope(mccInfo: MCCCategory | null, envelopes: any[]) {
    if (!mccInfo) return envelopes[0]; // Fallback to first envelope
    
    return envelopes
      .map(env => ({
        ...env,
        score: this.calculateEnvelopeMatchScore(mccInfo.category, env),
      }))
      .sort((a, b) => b.score - a.score)[0];
  }
}

export const mccDatabase = new MCCDatabase();


import { logger } from './logger.js';
import { db } from './db.js';
import { envelopeAutoRouter } from './envelopeAutoRouter.js';

export interface EnvelopeTemplate {
  name: string;
  icon?: string;
  color?: string;
  category: string;
  description: string;
  suggestedAllocation: number;
  priority: 'essential' | 'important' | 'optional';
  autoRoutePercentage?: number;
  isConditional?: boolean;
  condition?: 'tithe_required';
}

export interface EnvelopeSystemConfig {
  userId: string;
  userType: 'consumer' | 'creator' | 'hybrid';
  monthlyIncome?: number;
  needsTitheEnvelope: boolean;
  hasBusinessExpenses: boolean;
  preferredCount: number;
}

class EnvelopeSystem {
  private readonly MAX_ENVELOPES = 10;

  // Base envelope templates for all users
  private readonly baseEnvelopes: EnvelopeTemplate[] = [
    {
      name: 'Emergency Fund',
      icon: '🚨',
      color: 'red',
      category: 'security',
      description: 'Financial safety net for unexpected expenses',
      suggestedAllocation: 20,
      priority: 'essential',
    },
    {
      name: 'Housing',
      icon: '🏠',
      color: 'blue',
      category: 'necessities',
      description: 'Rent/mortgage, utilities, home maintenance',
      suggestedAllocation: 30,
      priority: 'essential',
    },
    {
      name: 'Transportation',
      icon: '🚗',
      color: 'green',
      category: 'necessities',
      description: 'Car payments, gas, maintenance, public transit',
      suggestedAllocation: 12,
      priority: 'essential',
    },
    {
      name: 'Food & Groceries',
      icon: '🛒',
      color: 'orange',
      category: 'necessities',
      description: 'Groceries and essential food expenses',
      suggestedAllocation: 12,
      priority: 'essential',
    },
    {
      name: 'Personal & Entertainment',
      icon: '🎬',
      color: 'purple',
      category: 'lifestyle',
      description: 'Movies, dining out, hobbies, personal care',
      suggestedAllocation: 10,
      priority: 'important',
    },
    {
      name: 'Savings & Goals',
      icon: '💰',
      color: 'yellow',
      category: 'savings',
      description: 'Long-term savings and financial goals',
      suggestedAllocation: 15,
      priority: 'important',
    },
  ];

  // Conditional Tithe envelope (only for church-goers who tithe)
  private readonly titheEnvelope: EnvelopeTemplate = {
    name: 'Tithe & Giving',
    icon: '⛪',
    color: 'gold',
    category: 'giving',
    description: 'Church tithes and charitable giving',
    suggestedAllocation: 10,
    priority: 'essential',
    autoRoutePercentage: 10,
    isConditional: true,
    condition: 'tithe_required',
  };

  // Creator-specific envelopes
  private readonly creatorEnvelopes: EnvelopeTemplate[] = [
    {
      name: 'Tax Savings',
      icon: '📊',
      color: 'indigo',
      category: 'taxes',
      description: 'Quarterly tax payments and self-employment tax',
      suggestedAllocation: 30,
      priority: 'essential',
    },
    {
      name: 'Equipment & Software',
      icon: '💻',
      color: 'cyan',
      category: 'business',
      description: 'Cameras, editing software, computers, gear',
      suggestedAllocation: 8,
      priority: 'important',
    },
    {
      name: 'Marketing & Growth',
      icon: '📈',
      color: 'pink',
      category: 'business',
      description: 'Advertising, courses, networking events',
      suggestedAllocation: 5,
      priority: 'optional',
    },
  ];

  async generateEnvelopeRecommendations(config: EnvelopeSystemConfig): Promise<{
    envelopes: EnvelopeTemplate[];
    totalAllocation: number;
    titheIncluded: boolean;
    adjustmentsNeeded: boolean;
  }> {
    try {
      logger.info({ 
        userId: config.userId, 
        userType: config.userType,
        needsTithe: config.needsTitheEnvelope 
      }, 'Generating envelope recommendations');

      let selectedEnvelopes: EnvelopeTemplate[] = [];
      let availableSlots = this.MAX_ENVELOPES;

      // Step 1: Add conditional Tithe envelope if required
      if (config.needsTitheEnvelope) {
        selectedEnvelopes.push(this.titheEnvelope);
        availableSlots--;
        logger.info({ userId: config.userId }, 'Tithe envelope included with 10% auto-routing');
      }

      // Step 2: Add base envelopes
      selectedEnvelopes.push(...this.baseEnvelopes.slice(0, Math.min(availableSlots, this.baseEnvelopes.length)));
      availableSlots -= this.baseEnvelopes.length;

      // Step 3: Add creator-specific envelopes if applicable
      if ((config.userType === 'creator' || config.userType === 'hybrid') && availableSlots > 0) {
        const creatorEnvelopesToAdd = this.creatorEnvelopes
          .filter(env => env.priority === 'essential')
          .slice(0, availableSlots);
        
        selectedEnvelopes.push(...creatorEnvelopesToAdd);
        availableSlots -= creatorEnvelopesToAdd.length;

        // Add optional creator envelopes if space available
        if (availableSlots > 0) {
          const optionalCreatorEnvelopes = this.creatorEnvelopes
            .filter(env => env.priority !== 'essential')
            .slice(0, availableSlots);
          selectedEnvelopes.push(...optionalCreatorEnvelopes);
        }
      }

      // Step 4: Adjust allocations to ensure they sum to 100%
      const { adjustedEnvelopes, adjustmentsNeeded } = this.adjustAllocations(
        selectedEnvelopes.slice(0, this.MAX_ENVELOPES),
        config
      );

      const totalAllocation = adjustedEnvelopes.reduce((sum, env) => sum + env.suggestedAllocation, 0);

      return {
        envelopes: adjustedEnvelopes,
        totalAllocation,
        titheIncluded: config.needsTitheEnvelope,
        adjustmentsNeeded,
      };

    } catch (error) {
      logger.error({ error, userId: config.userId }, 'Failed to generate envelope recommendations');
      throw error;
    }
  }

  private adjustAllocations(
    envelopes: EnvelopeTemplate[],
    config: EnvelopeSystemConfig
  ): { adjustedEnvelopes: EnvelopeTemplate[]; adjustmentsNeeded: boolean } {
    const adjustedEnvelopes = [...envelopes];
    let totalAllocation = envelopes.reduce((sum, env) => sum + env.suggestedAllocation, 0);
    let adjustmentsNeeded = false;

    // If we have a tithe envelope, reduce housing allocation to make room
    if (config.needsTitheEnvelope) {
      const housingEnvelope = adjustedEnvelopes.find(env => env.name === 'Housing');
      if (housingEnvelope) {
        housingEnvelope.suggestedAllocation = Math.max(25, housingEnvelope.suggestedAllocation - 5);
        adjustmentsNeeded = true;
      }
    }

    // Adjust for creator-specific needs
    if (config.userType === 'creator' || config.userType === 'hybrid') {
      const emergencyFund = adjustedEnvelopes.find(env => env.name === 'Emergency Fund');
      if (emergencyFund) {
        emergencyFund.suggestedAllocation = 25; // Increased for irregular income
        adjustmentsNeeded = true;
      }
    }

    // Ensure total doesn't exceed 100%
    totalAllocation = adjustedEnvelopes.reduce((sum, env) => sum + env.suggestedAllocation, 0);
    if (totalAllocation > 100) {
      const excess = totalAllocation - 100;
      const adjustableEnvelopes = adjustedEnvelopes.filter(env => 
        env.priority !== 'essential' && !env.isConditional
      );

      if (adjustableEnvelopes.length > 0) {
        const reductionPerEnvelope = excess / adjustableEnvelopes.length;
        adjustableEnvelopes.forEach(env => {
          env.suggestedAllocation = Math.max(5, env.suggestedAllocation - reductionPerEnvelope);
        });
        adjustmentsNeeded = true;
      }
    }

    return { adjustedEnvelopes, adjustmentsNeeded };
  }

  async createUserEnvelopes(
    userId: string,
    recommendations: EnvelopeTemplate[],
    monthlyIncome?: number
  ): Promise<{
    created: number;
    envelopes: Array<{
      id: string;
      name: string;
      targetAmount: number;
      autoRoute: boolean;
      autoRoutePercentage?: number;
    }>;
    titheSetup: boolean;
  }> {
    try {
      logger.info({ userId, envelopeCount: recommendations.length }, 'Creating user envelopes');

      // Check current envelope count
      const existingCount = await db.envelope.count({ where: { userId } });
      const totalEnvelopes = existingCount + recommendations.length;

      if (totalEnvelopes > this.MAX_ENVELOPES) {
        throw new Error(`Cannot create envelopes. Would exceed maximum of ${this.MAX_ENVELOPES} envelopes.`);
      }

      const createdEnvelopes = [];
      let titheSetup = false;

      for (const envelope of recommendations) {
        const targetAmount = monthlyIncome 
          ? (monthlyIncome * envelope.suggestedAllocation) / 100
          : envelope.suggestedAllocation * 50; // Default assumption

        const createdEnvelope = await db.envelope.create({
          data: {
            userId,
            name: envelope.name,
            icon: envelope.icon,
            color: envelope.color || 'blue',
            targetAmount,
            balance: 0,
            category: envelope.category,
            description: envelope.description,
            autoAllocate: !!envelope.autoRoutePercentage,
            allocationPercentage: envelope.autoRoutePercentage || null,
            priority: envelope.priority,
          }
        });

        createdEnvelopes.push({
          id: createdEnvelope.id,
          name: createdEnvelope.name,
          targetAmount: createdEnvelope.targetAmount,
          autoRoute: createdEnvelope.autoAllocate,
          autoRoutePercentage: createdEnvelope.allocationPercentage,
        });

        // Track if tithe envelope was created
        if (envelope.isConditional && envelope.condition === 'tithe_required') {
          titheSetup = true;
          logger.info({
            userId,
            envelopeId: createdEnvelope.id,
            autoRoutePercentage: envelope.autoRoutePercentage
          }, 'Tithe envelope created with auto-routing');
        }
      }

      return {
        created: createdEnvelopes.length,
        envelopes: createdEnvelopes,
        titheSetup,
      };

    } catch (error) {
      logger.error({ error, userId }, 'Failed to create user envelopes');
      throw error;
    }
  }

  async validateEnvelopeCount(userId: string): Promise<{
    currentCount: number;
    isAtLimit: boolean;
    canAddMore: boolean;
    availableSlots: number;
  }> {
    try {
      const currentCount = await db.envelope.count({
        where: { userId, isActive: true }
      });

      return {
        currentCount,
        isAtLimit: currentCount >= this.MAX_ENVELOPES,
        canAddMore: currentCount < this.MAX_ENVELOPES,
        availableSlots: Math.max(0, this.MAX_ENVELOPES - currentCount),
      };

    } catch (error) {
      logger.error({ error, userId }, 'Failed to validate envelope count');
      throw error;
    }
  }

  async rebalanceEnvelopes(userId: string, newConfig?: Partial<EnvelopeSystemConfig>): Promise<{
    rebalanced: boolean;
    changes: Array<{
      envelopeId: string;
      oldAllocation: number;
      newAllocation: number;
    }>;
  }> {
    try {
      logger.info({ userId }, 'Rebalancing user envelopes');

      const existingEnvelopes = await db.envelope.findMany({
        where: { userId, isActive: true }
      });

      const changes = [];
      // Implementation would analyze current allocations and suggest optimizations
      // This is a placeholder for the rebalancing logic

      return {
        rebalanced: false,
        changes,
      };

    } catch (error) {
      logger.error({ error, userId }, 'Failed to rebalance envelopes');
      throw error;
    }
  }

  getEnvelopeTemplates(userType: 'consumer' | 'creator' | 'hybrid', includeTithe = false): EnvelopeTemplate[] {
    let templates = [...this.baseEnvelopes];

    if (includeTithe) {
      templates.unshift(this.titheEnvelope);
    }

    if (userType === 'creator' || userType === 'hybrid') {
      templates.push(...this.creatorEnvelopes);
    }

    return templates;
  }
}

export const envelopeSystem = new EnvelopeSystem();


import { db } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { toolRegistry } from "./registry.js";
import { 
  EnvelopeActionParamsSchema, 
  ToolContext, 
  ToolResult,
  TOOL_CATEGORIES 
} from "./types.js";

// Envelope Creation Tool
const envelopeCreationExecute = async (params: any, context: ToolContext): Promise<ToolResult> => {
  try {
    const validatedParams = EnvelopeActionParamsSchema.parse(params);
    const { userId, name, description, targetAmount, category } = validatedParams;

    if (!name) {
      throw new Error("Envelope name is required for creation");
    }

    logger.info({ userId, name, targetAmount }, "Creating new envelope");

    // Check if envelope name already exists for user
    const existingEnvelope = await db.envelope.findFirst({
      where: {
        userId,
        name: {
          equals: name,
          mode: 'insensitive'
        }
      }
    });

    if (existingEnvelope) {
      return {
        success: false,
        error: `Envelope with name "${name}" already exists`
      };
    }

    // Create the envelope
    const envelope = await db.envelope.create({
      data: {
        userId,
        name,
        description: description || `Budget envelope for ${name}`,
        balance: 0,
        targetAmount: targetAmount ? Math.round(targetAmount * 100) : 0, // Convert to cents
        category: category || 'General'
      }
    });

    return {
      success: true,
      data: {
        envelope: {
          id: envelope.id,
          name: envelope.name,
          description: envelope.description,
          balance: envelope.balance / 100,
          targetAmount: envelope.targetAmount / 100,
          category: envelope.category
        }
      },
      message: `Envelope "${name}" created successfully with target of $${(targetAmount || 0).toFixed(2)}`
    };

  } catch (error: any) {
    logger.error({ error: error.message, userId: params.userId }, "Envelope creation failed");
    return {
      success: false,
      error: `Failed to create envelope: ${error.message}`
    };
  }
};

// Fund Allocation Tool
const fundAllocationExecute = async (params: any, context: ToolContext): Promise<ToolResult> => {
  try {
    const validatedParams = EnvelopeActionParamsSchema.parse(params);
    const { userId, fromEnvelopeId, toEnvelopeId, amount } = validatedParams;

    if (!fromEnvelopeId || !toEnvelopeId || !amount) {
      throw new Error("Fund allocation requires fromEnvelopeId, toEnvelopeId, and amount");
    }

    logger.info({ userId, fromEnvelopeId, toEnvelopeId, amount }, "Allocating funds between envelopes");

    // Get source and destination envelopes
    const [fromEnvelope, toEnvelope] = await Promise.all([
      db.envelope.findUnique({
        where: { id: fromEnvelopeId, userId }
      }),
      db.envelope.findUnique({
        where: { id: toEnvelopeId, userId }
      })
    ]);

    if (!fromEnvelope || !toEnvelope) {
      throw new Error("One or both envelopes not found");
    }

    const transferAmount = Math.round(amount * 100); // Convert to cents

    if (fromEnvelope.balance < transferAmount) {
      return {
        success: false,
        error: `Insufficient funds in "${fromEnvelope.name}". Available: $${(fromEnvelope.balance / 100).toFixed(2)}, Requested: $${amount.toFixed(2)}`
      };
    }

    // Perform the transfer using a transaction
    await db.$transaction(async (tx) => {
      // Subtract from source envelope
      await tx.envelope.update({
        where: { id: fromEnvelopeId },
        data: { balance: { decrement: transferAmount } }
      });

      // Add to destination envelope
      await tx.envelope.update({
        where: { id: toEnvelopeId },
        data: { balance: { increment: transferAmount } }
      });

      // Create transfer record
      await tx.transfer.create({
        data: {
          userId,
          fromEnvelopeId,
          toEnvelopeId,
          amount: transferAmount,
          description: `Transfer from ${fromEnvelope.name} to ${toEnvelope.name}`,
          status: 'completed'
        }
      });
    });

    return {
      success: true,
      data: {
        transfer: {
          from: fromEnvelope.name,
          to: toEnvelope.name,
          amount: amount,
          newFromBalance: (fromEnvelope.balance - transferAmount) / 100,
          newToBalance: (toEnvelope.balance + transferAmount) / 100
        }
      },
      message: `Successfully transferred $${amount.toFixed(2)} from "${fromEnvelope.name}" to "${toEnvelope.name}"`
    };

  } catch (error: any) {
    logger.error({ error: error.message, userId: params.userId }, "Fund allocation failed");
    return {
      success: false,
      error: `Fund allocation failed: ${error.message}`
    };
  }
};

// Category Optimization Tool
const categoryOptimizationExecute = async (params: any, context: ToolContext): Promise<ToolResult> => {
  try {
    const { userId } = params;

    logger.info({ userId }, "Analyzing envelope category optimization");

    // Get all user envelopes with transaction data
    const envelopes = await db.envelope.findMany({
      where: { userId },
      include: {
        transactions: {
          where: {
            createdAt: {
              gte: new Date(Date.now() - (90 * 24 * 60 * 60 * 1000)) // Last 90 days
            }
          }
        }
      }
    });

    // Analyze categories and suggest optimizations
    const categoryAnalysis = {};
    const recommendations = [];

    envelopes.forEach(envelope => {
      const category = envelope.category || 'Uncategorized';
      const totalSpent = envelope.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const utilizationRate = envelope.targetAmount > 0 ? (totalSpent / envelope.targetAmount) * 100 : 0;

      if (!categoryAnalysis[category]) {
        categoryAnalysis[category] = {
          envelopeCount: 0,
          totalBudget: 0,
          totalSpent: 0,
          averageUtilization: 0,
          envelopes: []
        };
      }

      categoryAnalysis[category].envelopeCount++;
      categoryAnalysis[category].totalBudget += envelope.targetAmount;
      categoryAnalysis[category].totalSpent += totalSpent;
      categoryAnalysis[category].envelopes.push({
        name: envelope.name,
        utilization: utilizationRate
      });
    });

    // Generate optimization recommendations
    Object.entries(categoryAnalysis).forEach(([category, data]: [string, any]) => {
      data.averageUtilization = data.totalBudget > 0 ? (data.totalSpent / data.totalBudget) * 100 : 0;

      if (data.averageUtilization > 120) {
        recommendations.push({
          type: 'over_allocation',
          category,
          message: `${category} category is consistently over budget (${data.averageUtilization.toFixed(0)}% utilization). Consider increasing budgets or reducing spending.`,
          priority: 'high'
        });
      } else if (data.averageUtilization < 50) {
        recommendations.push({
          type: 'under_allocation',
          category,
          message: `${category} category has low utilization (${data.averageUtilization.toFixed(0)}%). Consider reallocating funds to other categories.`,
          priority: 'medium'
        });
      }

      if (data.envelopeCount > 5) {
        recommendations.push({
          type: 'consolidation',
          category,
          message: `${category} has ${data.envelopeCount} envelopes. Consider consolidating similar envelopes for better management.`,
          priority: 'low'
        });
      }
    });

    return {
      success: true,
      data: {
        categoryAnalysis,
        recommendations,
        summary: {
          totalCategories: Object.keys(categoryAnalysis).length,
          totalEnvelopes: envelopes.length,
          highPriorityRecommendations: recommendations.filter(r => r.priority === 'high').length
        }
      },
      message: `Category optimization analysis completed with ${recommendations.length} recommendations`
    };

  } catch (error: any) {
    logger.error({ error: error.message, userId: params.userId }, "Category optimization failed");
    return {
      success: false,
      error: `Category optimization failed: ${error.message}`
    };
  }
};

// Register envelope tools
toolRegistry.registerTool({
  name: "envelope_creation",
  description: "Create new budget envelopes with specified targets and categories",
  category: TOOL_CATEGORIES.ENVELOPE,
  parameters: EnvelopeActionParamsSchema,
  execute: envelopeCreationExecute,
  requiresAuth: true,
  riskLevel: 'low',
  estimatedDuration: 1000
});

toolRegistry.registerTool({
  name: "fund_allocation",
  description: "Transfer funds between envelopes safely with balance validation",
  category: TOOL_CATEGORIES.ENVELOPE,
  parameters: EnvelopeActionParamsSchema,
  execute: fundAllocationExecute,
  requiresAuth: true,
  riskLevel: 'medium',
  estimatedDuration: 1500
});

toolRegistry.registerTool({
  name: "category_optimization",
  description: "Analyze envelope categories and suggest optimizations for better budget management",
  category: TOOL_CATEGORIES.ENVELOPE,
  parameters: EnvelopeActionParamsSchema,
  execute: categoryOptimizationExecute,
  requiresAuth: true,
  riskLevel: 'low',
  estimatedDuration: 2000
});

export { envelopeCreationExecute, fundAllocationExecute, categoryOptimizationExecute };


import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { sanitizeString, sanitizeEmail, sanitizeAlphanumeric } from './security.js';

// Common validation schemas
export const CommonSchemas = {
  email: z.string()
    .email('Invalid email format')
    .max(255, 'Email too long')
    .transform(sanitizeEmail),
    
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number'),
    
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name too long')
    .transform(sanitizeString),
    
  phone: z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
    .transform(sanitizeAlphanumeric),
    
  envelopeName: z.string()
    .min(1, 'Envelope name is required')
    .max(50, 'Envelope name too long')
    .transform(sanitizeString),
    
  amount: z.number()
    .int('Amount must be an integer')
    .min(0, 'Amount must be positive')
    .max(1000000000, 'Amount too large'), // $10M limit
    
  merchant: z.string()
    .min(1, 'Merchant name is required')
    .max(100, 'Merchant name too long')
    .transform(sanitizeString),
    
  mcc: z.string()
    .regex(/^\d{4}$/, 'MCC must be 4 digits')
    .transform(sanitizeAlphanumeric),
    
  location: z.string()
    .max(200, 'Location too long')
    .transform(sanitizeString)
    .optional(),
    
  description: z.string()
    .max(500, 'Description too long')
    .transform(sanitizeString)
    .optional(),
    
  icon: z.string()
    .regex(/^[a-z-]+$/, 'Invalid icon format')
    .max(30, 'Icon name too long')
    .transform(sanitizeAlphanumeric),
    
  color: z.string()
    .regex(/^[a-z]+$/, 'Invalid color format')
    .max(20, 'Color name too long')
    .transform(sanitizeAlphanumeric),
    
  uuid: z.string()
    .uuid('Invalid UUID format'),
    
  positiveInt: z.number()
    .int('Must be an integer')
    .positive('Must be positive'),
    
  order: z.number()
    .int('Order must be an integer')
    .min(0, 'Order must be non-negative')
    .max(100, 'Order too large'),
};

// Auth validation schemas
export const AuthSchemas = {
  register: z.object({
    email: CommonSchemas.email,
    password: CommonSchemas.password,
    name: CommonSchemas.name.optional(),
  }),
  
  login: z.object({
    email: CommonSchemas.email,
    password: z.string().min(1, 'Password is required'),
  }),
  
  verifyEmail: z.object({
    token: z.string()
      .min(1, 'Verification token is required')
      .max(100, 'Token too long')
      .transform(sanitizeAlphanumeric),
  }),
  
  startPhoneVerification: z.object({
    phone: CommonSchemas.phone,
  }),
  
  verifyPhone: z.object({
    phone: CommonSchemas.phone,
    code: z.string()
      .regex(/^\d{6}$/, 'Verification code must be 6 digits')
      .transform(sanitizeAlphanumeric),
  }),
};

// Envelope validation schemas
export const EnvelopeSchemas = {
  create: z.object({
    name: CommonSchemas.envelopeName,
    icon: CommonSchemas.icon.optional(),
    color: CommonSchemas.color.optional(),
    initialBalanceCents: CommonSchemas.amount.optional(),
    order: CommonSchemas.order.optional(),
  }),
  
  update: z.object({
    name: CommonSchemas.envelopeName.optional(),
    icon: CommonSchemas.icon.optional(),
    color: CommonSchemas.color.optional(),
    order: CommonSchemas.order.optional(),
    isActive: z.boolean().optional(),
  }),
  
  transfer: z.object({
    fromId: CommonSchemas.uuid.optional(),
    toId: CommonSchemas.uuid,
    amountCents: CommonSchemas.amount,
    note: CommonSchemas.description.optional(),
  }),
};

// Transaction validation schemas
export const TransactionSchemas = {
  create: z.object({
    merchant: CommonSchemas.merchant,
    amountCents: z.number().int('Amount must be an integer'),
    mcc: CommonSchemas.mcc.optional(),
    location: CommonSchemas.location.optional(),
    envelopeId: CommonSchemas.uuid.optional(),
  }),
  
  update: z.object({
    envelopeId: CommonSchemas.uuid.optional(),
    note: CommonSchemas.description.optional(),
  }),
  
  categorize: z.object({
    transactionId: CommonSchemas.uuid,
    envelopeId: CommonSchemas.uuid,
  }),
};

// AI validation schemas
export const AISchemas = {
  coach: z.object({
    message: z.string()
      .min(1, 'Message is required')
      .max(1000, 'Message too long')
      .transform(sanitizeString),
    context: z.object({
      includeTransactions: z.boolean().optional(),
      includeEnvelopes: z.boolean().optional(),
      includeBudget: z.boolean().optional(),
    }).optional(),
  }),
  
  setupEnvelopes: z.object({
    preferences: z.object({
      monthlyIncome: CommonSchemas.amount.optional(),
      categories: z.array(z.string().transform(sanitizeString)).optional(),
      savingsGoal: CommonSchemas.amount.optional(),
    }),
  }),
  
  executeAction: z.object({
    action: z.enum(['create_envelope', 'transfer_funds', 'categorize_transaction', 'budget_analysis']),
    parameters: z.record(z.any()),
  }),
};

// Rule validation schemas
export const RuleSchemas = {
  create: z.object({
    priority: z.number().int().min(1).max(1000),
    merchant: CommonSchemas.merchant.optional(),
    mcc: CommonSchemas.mcc.optional(),
    amountMin: CommonSchemas.amount.optional(),
    amountMax: CommonSchemas.amount.optional(),
    envelopeId: CommonSchemas.uuid,
    isActive: z.boolean().optional(),
  }),
  
  update: z.object({
    priority: z.number().int().min(1).max(1000).optional(),
    merchant: CommonSchemas.merchant.optional(),
    mcc: CommonSchemas.mcc.optional(),
    amountMin: CommonSchemas.amount.optional(),
    amountMax: CommonSchemas.amount.optional(),
    envelopeId: CommonSchemas.uuid.optional(),
    isActive: z.boolean().optional(),
  }),
};

// Generic validation middleware factory
export function validateSchema<T>(schema: z.ZodSchema<T>, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = source === 'body' ? req.body : 
                   source === 'query' ? req.query : req.params;
      
      const validation = schema.safeParse(data);
      
      if (!validation.success) {
        const errors = validation.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        
        logger.warn({
          url: req.originalUrl,
          method: req.method,
          userId: (req as any).user?.id,
          validationErrors: errors,
        }, 'Input validation failed');
        
        return res.status(400).json({
          ok: false,
          error: 'Validation failed',
          details: errors,
          code: 'VALIDATION_ERROR',
        });
      }
      
      // Replace the original data with validated and sanitized data
      if (source === 'body') {
        req.body = validation.data;
      } else if (source === 'query') {
        req.query = validation.data as any;
      } else {
        req.params = validation.data as any;
      }
      
      next();
    } catch (error) {
      logger.error({ error, url: req.originalUrl }, 'Validation middleware error');
      return res.status(500).json({
        ok: false,
        error: 'Internal validation error',
        code: 'VALIDATION_SYSTEM_ERROR',
      });
    }
  };
}

// Convenience middleware exports
export const validateAuth = {
  register: validateSchema(AuthSchemas.register),
  login: validateSchema(AuthSchemas.login),
  verifyEmail: validateSchema(AuthSchemas.verifyEmail),
  startPhoneVerification: validateSchema(AuthSchemas.startPhoneVerification),
  verifyPhone: validateSchema(AuthSchemas.verifyPhone),
};

export const validateEnvelope = {
  create: validateSchema(EnvelopeSchemas.create),
  update: validateSchema(EnvelopeSchemas.update),
  transfer: validateSchema(EnvelopeSchemas.transfer),
};

export const validateTransaction = {
  create: validateSchema(TransactionSchemas.create),
  update: validateSchema(TransactionSchemas.update),
  categorize: validateSchema(TransactionSchemas.categorize),
};

export const validateAI = {
  coach: validateSchema(AISchemas.coach),
  setupEnvelopes: validateSchema(AISchemas.setupEnvelopes),
  executeAction: validateSchema(AISchemas.executeAction),
};

export const validateRule = {
  create: validateSchema(RuleSchemas.create),
  update: validateSchema(RuleSchemas.update),
};

// Parameter validation for route params
export const validateParams = {
  id: validateSchema(z.object({ id: CommonSchemas.uuid }), 'params'),
  envelopeId: validateSchema(z.object({ envelopeId: CommonSchemas.uuid }), 'params'),
  transactionId: validateSchema(z.object({ transactionId: CommonSchemas.uuid }), 'params'),
};

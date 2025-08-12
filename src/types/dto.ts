
import { z } from 'zod';

// Common schemas
export const PaginationSchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 20),
});

// Envelope DTOs
export const CreateEnvelopeSchema = z.object({
  name: z.string().min(1),
  budgetLimit: z.number().min(0),
  color: z.string().optional(),
});

export const UpdateEnvelopeSchema = z.object({
  name: z.string().min(1).optional(),
  budgetLimit: z.number().min(0).optional(),
  color: z.string().optional(),
  isActive: z.boolean().optional(),
});

// Transaction DTOs
export const CreateTransactionSchema = z.object({
  amount: z.number(),
  description: z.string(),
  merchantName: z.string().optional(),
  mcc: z.string().optional(),
  location: z.string().optional(),
  fromEnvelopeId: z.number().optional(),
  toEnvelopeId: z.number().optional(),
  cardId: z.number().optional(),
});

// Transfer DTOs
export const CreateTransferSchema = z.object({
  amount: z.number().positive(),
  description: z.string().optional(),
  fromEnvelopeId: z.number(),
  toEnvelopeId: z.number(),
});

// Routing Rule DTOs
export const CreateRoutingRuleSchema = z.object({
  name: z.string().min(1),
  priority: z.number().min(1),
  conditions: z.record(z.any()),
  envelopeId: z.number(),
});

export const UpdateRoutingRuleSchema = z.object({
  name: z.string().min(1).optional(),
  priority: z.number().min(1).optional(),
  conditions: z.record(z.any()).optional(),
  envelopeId: z.number().optional(),
  isActive: z.boolean().optional(),
});

// Card DTOs
export const CreateCardSchema = z.object({
  name: z.string().min(1),
  cardType: z.enum(['virtual', 'physical']),
});

export const UpdateCardSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['active', 'inactive', 'blocked']).optional(),
  isDefault: z.boolean().optional(),
});

// AI DTOs
export const AICoachRequestSchema = z.object({
  question: z.string().min(1),
  context: z.record(z.any()).optional(),
});

export const RoutingExplanationRequestSchema = z.object({
  transactionData: z.object({
    amount: z.number(),
    merchantName: z.string().optional(),
    mcc: z.string().optional(),
    location: z.string().optional(),
  }),
});

export type CreateEnvelopeDTO = z.infer<typeof CreateEnvelopeSchema>;
export type UpdateEnvelopeDTO = z.infer<typeof UpdateEnvelopeSchema>;
export type CreateTransactionDTO = z.infer<typeof CreateTransactionSchema>;
export type CreateTransferDTO = z.infer<typeof CreateTransferSchema>;
export type CreateRoutingRuleDTO = z.infer<typeof CreateRoutingRuleSchema>;
export type UpdateRoutingRuleDTO = z.infer<typeof UpdateRoutingRuleSchema>;
export type CreateCardDTO = z.infer<typeof CreateCardSchema>;
export type UpdateCardDTO = z.infer<typeof UpdateCardSchema>;
export type AICoachRequestDTO = z.infer<typeof AICoachRequestSchema>;
export type RoutingExplanationRequestDTO = z.infer<typeof RoutingExplanationRequestSchema>;
export type PaginationDTO = z.infer<typeof PaginationSchema>;


import { z } from 'zod';

// Common schemas
export const PaginationSchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 20),
});

// Envelope DTOs
export const CreateEnvelopeSchema = z.object({
  name: z.string().min(1),
  balanceCents: z.number().min(0).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  order: z.number().min(0).optional(),
});

export const UpdateEnvelopeSchema = z.object({
  name: z.string().min(1).optional(),
  balanceCents: z.number().min(0).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  order: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

// Transaction DTOs
export const CreateTransactionSchema = z.object({
  amountCents: z.number(),
  merchant: z.string(),
  mcc: z.string().optional(),
  location: z.string().optional(),
  envelopeId: z.number().optional(),
  cardId: z.number().optional(),
  wasHold: z.boolean().optional(),
  holdAmountCents: z.number().optional(),
});

// Transfer DTOs
export const CreateTransferSchema = z.object({
  amountCents: z.number().positive(),
  note: z.string().optional(),
  fromId: z.number().optional(),
  toId: z.number().optional(),
});

// Rule DTOs (updated for new structure)
export const CreateRuleSchema = z.object({
  priority: z.number().min(0).optional(),
  mcc: z.string().optional(),
  merchant: z.string().optional(),
  geofence: z.string().optional(),
  envelopeId: z.number().optional(),
});

export const UpdateRuleSchema = z.object({
  priority: z.number().min(0).optional(),
  mcc: z.string().optional(),
  merchant: z.string().optional(),
  geofence: z.string().optional(),
  envelopeId: z.number().optional(),
  enabled: z.boolean().optional(),
});

// Card DTOs
export const CreateCardSchema = z.object({
  last4: z.string().length(4),
  label: z.string().optional(),
  token: z.string().optional(),
  envelopeId: z.number().optional(),
});

export const UpdateCardSchema = z.object({
  label: z.string().optional(),
  inWallet: z.boolean().optional(),
  envelopeId: z.number().optional(),
});

// Routing Config DTOs
export const UpdateRoutingConfigSchema = z.object({
  spendMode: z.enum(['LOCKED', 'SMART_AUTO', 'GENERAL_POOL']).optional(),
  lockedEnvelopeId: z.number().optional(),
  useGeneralPool: z.boolean().optional(),
  bufferCents: z.number().min(0).optional(),
  confidence: z.number().min(0).max(100).optional(),
});

// AI DTOs
export const AICoachRequestSchema = z.object({
  goal: z.string().optional(),
  constraints: z.array(z.string()).optional(),
  months: z.number().optional(),
  question: z.string().optional(),
  context: z.record(z.any()).optional(),
});

export const RoutingExplanationRequestSchema = z.object({
  transactionData: z.object({
    amountCents: z.number(),
    merchant: z.string().optional(),
    mcc: z.string().optional(),
    location: z.string().optional(),
  }),
});

// Type exports
export type CreateEnvelopeDTO = z.infer<typeof CreateEnvelopeSchema>;
export type UpdateEnvelopeDTO = z.infer<typeof UpdateEnvelopeSchema>;
export type CreateTransactionDTO = z.infer<typeof CreateTransactionSchema>;
export type CreateTransferDTO = z.infer<typeof CreateTransferSchema>;
export type CreateRuleDTO = z.infer<typeof CreateRuleSchema>;
export type UpdateRuleDTO = z.infer<typeof UpdateRuleSchema>;
export type CreateCardDTO = z.infer<typeof CreateCardSchema>;
export type UpdateCardDTO = z.infer<typeof UpdateCardSchema>;
export type UpdateRoutingConfigDTO = z.infer<typeof UpdateRoutingConfigSchema>;
export type AICoachRequestDTO = z.infer<typeof AICoachRequestSchema>;
export type RoutingExplanationRequestDTO = z.infer<typeof RoutingExplanationRequestSchema>;
export type PaginationDTO = z.infer<typeof PaginationSchema>;

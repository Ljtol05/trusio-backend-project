
import { z } from "zod";

export const CoachPlan = z.object({
  allocations: z.array(z.object({
    envelope: z.string(),
    monthlyCents: z.number().int().nonnegative(),
  })),
  notes: z.array(z.string()).default([]),
});

export type CoachPlan = z.infer<typeof CoachPlan>;

export const RouteExplanation = z.object({
  envelope: z.string(),
  reason: z.string(),
  confidence: z.number().min(0).max(100),
});

export type RouteExplanation = z.infer<typeof RouteExplanation>;

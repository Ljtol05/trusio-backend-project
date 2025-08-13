
import { logger } from './logger.js';

export type KycStatus = 'not_started' | 'pending' | 'approved' | 'rejected';

export interface KycStatusResponse {
  status: KycStatus;
  providerRef?: string;
  reason?: string;
}

export interface KycFormData {
  legalFirstName: string;
  legalLastName: string;
  dob: string; // YYYY-MM-DD
  ssnLast4: string; // 4 digits
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
}

interface KycSession {
  status: KycStatus;
  providerRef: string;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory store: userId -> KycSession
const kycSessions = new Map<string, KycSession>();

// Provider ref -> userId mapping for webhook lookups
const providerRefToUserId = new Map<string, string>();

export function generateProviderRef(): string {
  return `kyc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function startKyc(userId: string, data: KycFormData): KycStatusResponse {
  const providerRef = generateProviderRef();
  const now = new Date();
  
  const session: KycSession = {
    status: 'pending',
    providerRef,
    createdAt: now,
    updatedAt: now,
  };

  kycSessions.set(userId, session);
  providerRefToUserId.set(providerRef, userId);

  logger.info({ userId, providerRef }, 'KYC session started');

  return {
    status: session.status,
    providerRef: session.providerRef,
  };
}

export function getKycStatus(userId: string): KycStatusResponse {
  const session = kycSessions.get(userId);
  
  if (!session) {
    return { status: 'not_started' };
  }

  return {
    status: session.status,
    providerRef: session.providerRef,
    reason: session.reason,
  };
}

export function updateKycStatusByRef(
  providerRef: string,
  decision: 'approved' | 'rejected',
  reason?: string
): boolean {
  const userId = providerRefToUserId.get(providerRef);
  
  if (!userId) {
    logger.warn({ providerRef }, 'KYC webhook received for unknown providerRef');
    return false;
  }

  const session = kycSessions.get(userId);
  if (!session) {
    logger.warn({ userId, providerRef }, 'KYC session not found for user');
    return false;
  }

  session.status = decision;
  session.reason = reason;
  session.updatedAt = new Date();

  kycSessions.set(userId, session);

  logger.info({ userId, providerRef, decision, reason }, 'KYC status updated via webhook');
  return true;
}

// Optional: cleanup old sessions (can be called periodically)
export function cleanupOldSessions(maxAgeHours: number = 24): number {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  let cleaned = 0;

  for (const [userId, session] of kycSessions.entries()) {
    if (session.createdAt < cutoff) {
      kycSessions.delete(userId);
      providerRefToUserId.delete(session.providerRef);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info({ cleaned, maxAgeHours }, 'Cleaned up old KYC sessions');
  }

  return cleaned;
}


export type KycStatus = 'not_started' | 'pending' | 'approved' | 'rejected';

export interface KycStatusResponse {
  status: KycStatus;
  providerRef?: string;
  reason?: string;
}

export interface KycFormData {
  legalFirstName: string;
  legalLastName: string;
  dob: string; // YYYY-MM-DD format
  ssnLast4: string; // 4 digits
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string; // 2-letter state code
  postalCode: string;
}

export interface KycWebhookPayload {
  providerRef: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}

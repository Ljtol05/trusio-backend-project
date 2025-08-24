// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

const getBackendUrl = (): string => {
  // Check if we're in browser environment
  if (typeof window !== 'undefined') {
    // Check if we're in Replit development environment
    if (window.location.hostname.includes('replit')) {
      // Extract the backend subdomain from current URL
      const currentUrl = window.location.hostname;
      const parts = currentUrl.split('-');

      if (parts.length >= 2) {
        // Replace the first part with 'backend' to get backend URL
        parts[0] = 'backend';
        return `https://${parts.join('-')}`;
      }
    }
  }

  // Fallback to environment variable or localhost
  return process.env.VITE_API_URL || 'http://localhost:5000';
};

export const API_BASE_URL = getBackendUrl();

export const API_ENDPOINTS = {
  // Authentication
  REGISTER: '/api/auth/register',
  LOGIN: '/api/auth/login',
  VERIFY_EMAIL: '/api/auth/verify-email',
  RESEND_EMAIL: '/api/auth/resend-verification',
  START_PHONE_VERIFICATION: '/api/auth/start-phone-verification',
  VERIFY_PHONE: '/api/auth/verify-phone',
  RESEND_PHONE: '/api/auth/resend-phone-code',
  ME: '/api/auth/me',

  // KYC
  START_KYC: '/api/kyc/start',
  KYC_STATUS: '/api/kyc/status',

  // Core App
  ENVELOPES: '/api/envelopes',
  TRANSACTIONS: '/api/transactions',
  TRANSFERS: '/api/transfers',
  CARDS: '/api/cards',
  RULES: '/api/rules',

  // AI Features
  AI_CHAT: '/api/ai/chat',
  AI_TOOLS_EXECUTE: '/api/ai/tools/execute',
  AI_HANDOFF: '/api/ai/handoff',
  AI_AGENTS: '/api/ai/agents',
  AI_TOOLS: '/api/ai/tools',
  AI_STATUS: '/api/ai/status',

  // Real-time
  EVENTS: '/api/events',
} as const;
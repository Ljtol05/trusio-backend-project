
// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

const getBackendUrl = (): string => {
  // If not in browser (Node.js/test environment), return default
  if (!isBrowser) {
    return process.env.BACKEND_URL || 'http://localhost:5000';
  }

  // Check if we're in Replit development environment
  if (window.location.hostname.includes('replit.dev') || window.location.hostname.includes('repl.co')) {
    // Extract the backend subdomain from current URL
    const currentUrl = window.location.hostname;
    // Replace any subdomain with backend subdomain
    const backendUrl = currentUrl.replace(/^[^.]+/, 'backend');
    return `https://${backendUrl}`;
  }

  // For local development, check if port is specified
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `${window.location.protocol}//${window.location.hostname}:5000`;
  }

  // Fallback to current origin
  return window.location.origin;
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

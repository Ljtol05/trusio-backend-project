
// Auto-detect backend URL based on environment
const getBackendUrl = (): string => {
  // Check if we're in Replit development environment
  if (window.location.hostname.includes('replit.dev')) {
    // Extract the backend subdomain from current URL
    const currentUrl = window.location.hostname;
    
    // If frontend is on something like: abc-frontend-user.replit.dev
    // Backend should be on: abc-backend-user.replit.dev
    const backendUrl = currentUrl.replace('-frontend-', '-backend-');
    return `https://${backendUrl}`;
  }
  
  // For production, use environment variable or default
  return import.meta.env.VITE_API_URL || 'https://your-production-domain.com';
};

export const API_BASE_URL = getBackendUrl();

// Optional: Create axios instance with auto-detected base URL
import axios from 'axios';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Log the detected URL for debugging
console.log('🔗 Auto-detected API URL:', API_BASE_URL);

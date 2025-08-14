
// Simple API URL detection
export const getApiUrl = (): string => {
  const isDev = import.meta.env.DEV;
  const isReplit = window.location.hostname.includes('replit.dev');
  
  if (isDev && isReplit) {
    // Use your current backend Repl URL - update this when your Repl restarts
    return window.location.protocol + '//' + window.location.host;
  }
  
  if (isDev) {
    // Local development
    return 'http://localhost:5000';
  }
  
  // Production - use relative URLs (same domain)
  return '';
};

export const API_BASE_URL = getApiUrl();

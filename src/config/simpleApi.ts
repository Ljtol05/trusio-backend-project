
// Simple API URL detection
export const getApiUrl = (): string => {
  const isDev = import.meta.env.DEV;
  const isReplit = window.location.hostname.includes('replit.dev');
  
  if (isDev && isReplit) {
    // Use your current backend Repl URL - update this when your Repl restarts
    return 'https://d12fe605-62cb-49b0-b8ae-60c33cc2dc94-00-3mx79pg8q976x.janeway.replit.dev';
  }
  
  if (isDev) {
    // Local development
    return 'http://localhost:5000';
  }
  
  // Production - use relative URLs (same domain)
  return '';
};

export const API_BASE_URL = getApiUrl();

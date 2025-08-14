
// Dynamic backend discovery for Replit environment
export const discoverBackendUrl = async (): Promise<string> => {
  // If we're in Replit dev environment
  if (window.location.hostname.includes('replit.dev')) {
    const currentHostname = window.location.hostname;
    
    // Try common backend naming patterns
    const possibleBackends = [
      currentHostname.replace('-frontend-', '-backend-'),
      currentHostname.replace('frontend', 'backend'),
      // Add your specific backend repl name pattern here
      currentHostname.replace(/^[^-]+-/, 'envelopes-backend-')
    ];
    
    // Test each possible backend URL
    for (const backendHost of possibleBackends) {
      try {
        const testUrl = `https://${backendHost}/healthz`;
        const response = await fetch(testUrl, { 
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });
        
        if (response.ok) {
          console.log('✅ Found backend at:', `https://${backendHost}`);
          return `https://${backendHost}`;
        }
      } catch (error) {
        // Continue to next possibility
        console.log('❌ Backend not found at:', `https://${backendHost}`);
      }
    }
  }
  
  // Fallback to environment variable or manual URL
  return import.meta.env.VITE_API_URL || 'http://localhost:5000';
};

// Usage in your app initialization
export const initializeApi = async () => {
  const backendUrl = await discoverBackendUrl();
  return backendUrl;
};

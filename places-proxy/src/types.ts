export interface Config {
  googlePlacesApiKey: string;
  port: number;
  allowedOrigins: string[];
  cacheAcTtlSeconds: number;
  cacheDetailsTtlSeconds: number;
  cacheMaxItems: number;
  rateLimitGlobalWindowSeconds: number;
  rateLimitGlobalMax: number;
  rateLimitIpWindowSeconds: number;
  rateLimitIpMax: number;
  softFailAutocomplete: boolean;
  logLevel: string;
  requestTimeoutMs: number;
}

export interface AutocompleteSuggestion {
  id: string;
  description: string;
  primaryText: string;
  secondaryText: string;
}

export interface AutocompleteResponse {
  suggestions: AutocompleteSuggestion[];
}

export interface PlaceDetails {
  id: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  lat: number;
  lng: number;
}

export interface ErrorResponse {
  error: string;
  message: string;
  retryAfterSeconds?: number;
  retryable?: boolean;
}

export interface HealthResponse {
  status: string;
  uptimeSeconds: number;
  timestamp: string;
}

export interface GoogleAutocompleteResponse {
  predictions: Array<{
    place_id: string;
    description: string;
    structured_formatting: {
      main_text: string;
      secondary_text: string;
    };
  }>;
  status: string;
}

export interface GoogleDetailsResponse {
  result?: {
    place_id?: string;
    formatted_address: string;
    address_components: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
  };
  status: string;
}

export interface RateLimitWindow {
  count: number;
  resetTime: number;
}
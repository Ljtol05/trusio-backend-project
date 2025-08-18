
import type { 
  AutocompleteSuggestion, 
  AutocompleteResponse, 
  PlaceDetails, 
  GoogleAutocompleteResponse, 
  GoogleDetailsResponse 
} from './types.js';
import { UpstreamError } from './errors.js';
import { logger } from './logger.js';

export class GooglePlacesClient {
  private baseUrl = 'https://maps.googleapis.com/maps/api/place';

  constructor(private apiKey: string, private timeoutMs: number) {}

  async autocomplete(
    query: string, 
    sessionToken?: string, 
    limit: number = 5,
    reqId?: string
  ): Promise<AutocompleteResponse> {
    const url = new URL(`${this.baseUrl}/autocomplete/json`);
    url.searchParams.set('input', query);
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('types', 'address');
    if (sessionToken) {
      url.searchParams.set('sessiontoken', sessionToken);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const startTime = Date.now();
      const response = await fetch(url.toString(), {
        signal: controller.signal,
      });
      const latencyMs = Date.now() - startTime;

      clearTimeout(timeoutId);

      logger.debug('Google Autocomplete API response', {
        reqId,
        upstreamStatus: response.status,
        latencyMs,
      });

      if (!response.ok) {
        throw new UpstreamError(
          `Google API returned ${response.status}`,
          response.status >= 500
        );
      }

      const data: GoogleAutocompleteResponse = await response.json();
      
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new UpstreamError(`Google API status: ${data.status}`);
      }

      return this.normalizeAutocompleteResponse(data, limit);
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new UpstreamError('Request timeout', true);
      }
      
      if (error instanceof UpstreamError) {
        throw error;
      }
      
      throw new UpstreamError(`Network error: ${error.message}`, true);
    }
  }

  async getDetails(placeId: string, sessionToken?: string, reqId?: string): Promise<PlaceDetails> {
    const url = new URL(`${this.baseUrl}/details/json`);
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', 'address_component,geometry');
    url.searchParams.set('key', this.apiKey);
    if (sessionToken) {
      url.searchParams.set('sessiontoken', sessionToken);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const startTime = Date.now();
      const response = await fetch(url.toString(), {
        signal: controller.signal,
      });
      const latencyMs = Date.now() - startTime;

      clearTimeout(timeoutId);

      logger.debug('Google Details API response', {
        reqId,
        upstreamStatus: response.status,
        latencyMs,
      });

      if (!response.ok) {
        throw new UpstreamError(
          `Google API returned ${response.status}`,
          response.status >= 500
        );
      }

      const data: GoogleDetailsResponse = await response.json();
      
      if (data.status !== 'OK') {
        throw new UpstreamError(`Google API status: ${data.status}`);
      }

      return this.normalizeDetailsResponse(data, placeId);
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new UpstreamError('Request timeout', true);
      }
      
      if (error instanceof UpstreamError) {
        throw error;
      }
      
      throw new UpstreamError(`Network error: ${error.message}`, true);
    }
  }

  private normalizeAutocompleteResponse(
    data: GoogleAutocompleteResponse, 
    limit: number
  ): AutocompleteResponse {
    const suggestions: AutocompleteSuggestion[] = data.predictions
      .slice(0, limit)
      .map(prediction => ({
        id: prediction.place_id,
        description: prediction.description,
        primaryText: prediction.structured_formatting.main_text,
        secondaryText: prediction.structured_formatting.secondary_text || '',
      }));

    return { suggestions };
  }

  private normalizeDetailsResponse(data: GoogleDetailsResponse, placeId: string): PlaceDetails {
    const { result } = data;
    const components = result.address_components;
    
    let streetNumber = '';
    let route = '';
    let locality = '';
    let state = '';
    let postalCode = '';

    for (const component of components) {
      const types = component.types;
      
      if (types.includes('street_number')) {
        streetNumber = component.long_name;
      } else if (types.includes('route')) {
        route = component.long_name;
      } else if (types.includes('locality')) {
        locality = component.long_name;
      } else if (types.includes('administrative_area_level_1')) {
        state = component.short_name;
      } else if (types.includes('postal_code')) {
        postalCode = component.long_name;
      }
    }

    const addressLine1 = [streetNumber, route].filter(Boolean).join(' ');

    return {
      id: placeId,
      addressLine1,
      city: locality,
      state,
      postalCode,
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
    };
  }
}


import type {
  AutocompleteResponse,
  PlaceDetails,
  GoogleAutocompleteResponse,
  GoogleDetailsResponse
} from './types.js';
import { UpstreamError } from './errors.js';
import { logger } from './logger.js';

export class GooglePlacesClient {
  constructor(
    private apiKey: string,
    private timeoutMs: number
  ) {}

  async autocomplete(
    query: string,
    sessionToken?: string,
    limit: number = 5,
    reqId?: string
  ): Promise<AutocompleteResponse> {
    const startTime = Date.now();

    try {
      const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
      url.searchParams.set('input', query);
      url.searchParams.set('key', this.apiKey);
      url.searchParams.set('types', 'address');
      
      if (sessionToken) {
        url.searchParams.set('sessiontoken', sessionToken);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(url.toString(), {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;

      logger.debug('Google Autocomplete API response', {
        reqId,
        upstreamStatus: response.status,
        latencyMs,
      });

      if (!response.ok) {
        throw new UpstreamError(`Google API returned ${response.status}`);
      }

      const data: GoogleAutocompleteResponse = await response.json();

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new UpstreamError(`Google API status: ${data.status}`);
      }

      return this.normalizeAutocompleteResponse(data, limit);
    } catch (error) {
      if (error instanceof UpstreamError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new UpstreamError('Request timeout');
      }

      throw new UpstreamError('Network error');
    }
  }

  async getDetails(
    placeId: string,
    sessionToken?: string,
    reqId?: string
  ): Promise<PlaceDetails> {
    const startTime = Date.now();

    try {
      const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
      url.searchParams.set('place_id', placeId);
      url.searchParams.set('key', this.apiKey);
      url.searchParams.set('fields', 'place_id,address_components,geometry');
      
      if (sessionToken) {
        url.searchParams.set('sessiontoken', sessionToken);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(url.toString(), {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;

      logger.debug('Google Details API response', {
        reqId,
        upstreamStatus: response.status,
        latencyMs,
      });

      if (!response.ok) {
        throw new UpstreamError(`Google API returned ${response.status}`);
      }

      const data: GoogleDetailsResponse = await response.json();

      if (data.status !== 'OK') {
        throw new UpstreamError(`Google API status: ${data.status}`);
      }

      return this.normalizeDetailsResponse(data);
    } catch (error) {
      if (error instanceof UpstreamError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new UpstreamError('Request timeout');
      }

      throw new UpstreamError('Network error');
    }
  }

  private normalizeAutocompleteResponse(
    response: GoogleAutocompleteResponse,
    limit: number
  ): AutocompleteResponse {
    const suggestions = response.predictions
      .slice(0, limit)
      .map(prediction => ({
        id: prediction.place_id,
        description: prediction.description,
        primaryText: prediction.structured_formatting.main_text,
        secondaryText: prediction.structured_formatting.secondary_text,
      }));

    return { suggestions };
  }

  private normalizeDetailsResponse(response: GoogleDetailsResponse): PlaceDetails {
    const { result } = response;
    const addressComponents = result.address_components;

    const getComponent = (types: string[]) => {
      const component = addressComponents.find(comp =>
        comp.types.some(type => types.includes(type))
      );
      return component?.long_name || '';
    };

    const streetNumber = getComponent(['street_number']);
    const route = getComponent(['route']);
    const addressLine1 = streetNumber && route 
      ? `${streetNumber} ${route}` 
      : getComponent(['street_address']) || route || streetNumber;

    return {
      id: result.place_id,
      addressLine1,
      city: getComponent(['locality', 'sublocality']),
      state: getComponent(['administrative_area_level_1']),
      postalCode: getComponent(['postal_code']),
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
    };
  }
}

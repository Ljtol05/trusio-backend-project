
import { nanoid } from 'nanoid';
import { logger } from './logger.js';
import { UpstreamError } from './errors.js';
import type { AutocompleteResponse, PlaceDetails, GoogleAutocompleteResponse, GoogleDetailsResponse } from './types.js';

export class GooglePlacesClient {
  constructor(
    private apiKey: string,
    private timeoutMs: number = 2500
  ) {}

  async autocomplete(
    query: string,
    sessionToken?: string,
    limit: number = 5,
    reqId?: string
  ): Promise<AutocompleteResponse> {
    const startTime = Date.now();
    
    try {
      const params = new URLSearchParams({
        input: query,
        key: this.apiKey,
        types: 'address',
      });

      if (sessionToken) {
        params.set('sessiontoken', sessionToken);
      }

      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new UpstreamError(
          `Google Autocomplete API returned ${response.status}`,
          response.status >= 500
        );
      }

      const data: GoogleAutocompleteResponse = await response.json();
      const latencyMs = Date.now() - startTime;

      logger.debug('Google Autocomplete API response', {
        reqId,
        upstreamStatus: response.status,
        latencyMs,
      });

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new UpstreamError(`Google API error: ${data.status}`);
      }

      const suggestions = data.predictions?.slice(0, limit).map(prediction => ({
        id: prediction.place_id,
        description: prediction.description,
        primaryText: prediction.structured_formatting?.main_text || '',
        secondaryText: prediction.structured_formatting?.secondary_text || '',
      })) || [];

      return { suggestions };

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new UpstreamError('Request timeout');
      }
      throw error;
    }
  }

  async getDetails(
    placeId: string,
    sessionToken?: string,
    reqId?: string
  ): Promise<PlaceDetails> {
    const startTime = Date.now();
    
    try {
      const params = new URLSearchParams({
        place_id: placeId,
        key: this.apiKey,
        fields: 'formatted_address,address_components,geometry',
      });

      if (sessionToken) {
        params.set('sessiontoken', sessionToken);
      }

      const url = `https://maps.googleapis.com/maps/api/place/details/json?${params}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new UpstreamError(
          `Google Details API returned ${response.status}`,
          response.status >= 500
        );
      }

      const data: GoogleDetailsResponse = await response.json();
      const latencyMs = Date.now() - startTime;

      logger.debug('Google Details API response', {
        reqId,
        upstreamStatus: response.status,
        latencyMs,
      });

      if (data.status !== 'OK') {
        throw new UpstreamError(`Google API error: ${data.status}`);
      }

      if (!data.result) {
        throw new UpstreamError('No place details found');
      }

      // Extract address components
      const addressComponents = data.result.address_components || [];
      let addressLine1 = data.result.formatted_address || '';
      let city = '';
      let state = '';
      let postalCode = '';

      for (const component of addressComponents) {
        const types = component.types;
        
        if (types.includes('locality')) {
          city = component.long_name;
        } else if (types.includes('administrative_area_level_1')) {
          state = component.short_name;
        } else if (types.includes('postal_code')) {
          postalCode = component.long_name;
        }
      }

      const location = data.result.geometry?.location;
      if (!location) {
        throw new UpstreamError('No location data found');
      }

      return {
        id: placeId,
        addressLine1,
        city,
        state,
        postalCode,
        lat: location.lat,
        lng: location.lng,
      };

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new UpstreamError('Request timeout');
      }
      throw error;
    }
  }
}

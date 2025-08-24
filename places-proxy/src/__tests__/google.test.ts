import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GooglePlacesClient } from '../google.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('GooglePlacesClient', () => {
  let client: GooglePlacesClient;
  const mockApiKey = 'test-api-key';
  const timeoutMs = 1000;

  beforeEach(() => {
    client = new GooglePlacesClient(mockApiKey, timeoutMs);
    vi.clearAllMocks();
  });

  describe('autocomplete', () => {
    it('should normalize Google autocomplete response correctly', async () => {
      const mockResponse = {
        predictions: [
          {
            place_id: 'ChIJ123',
            description: '123 Main St, City, State',
            structured_formatting: {
              main_text: '123 Main St',
              secondary_text: 'City, State',
            },
          },
        ],
        status: 'OK',
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.autocomplete('123 Main', undefined, 5);

      expect(result).toEqual({
        suggestions: [
          {
            id: 'ChIJ123',
            description: '123 Main St, City, State',
            primaryText: '123 Main St',
            secondaryText: 'City, State',
          },
        ],
      });
    });

    it('should handle empty secondary text', async () => {
      const mockResponse = {
        predictions: [
          {
            place_id: 'ChIJ123',
            description: '123 Main St',
            structured_formatting: {
              main_text: '123 Main St',
            },
          },
        ],
        status: 'OK',
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.autocomplete('123 Main', undefined, 5);

      expect(result.suggestions[0]?.secondaryText).toBe('');
    });
  });

  describe('getDetails', () => {
    it('should normalize Google details response correctly', async () => {
      const mockResponse = {
        result: {
          place_id: 'ChIJ123',
          address_components: [
            { long_name: '123', types: ['street_number'] },
            { long_name: 'Main Street', types: ['route'] },
            { long_name: 'Anytown', types: ['locality'] },
            { long_name: 'CA', short_name: 'CA', types: ['administrative_area_level_1'] },
            { long_name: '12345', types: ['postal_code'] },
          ],
          geometry: {
            location: { lat: 37.7749, lng: -122.4194 },
          },
        },
        status: 'OK',
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.getDetails('ChIJ123');

      expect(result).toEqual({
        id: 'ChIJ123',
        addressLine1: '',  // Google API doesn't provide formatted address line in this mock
        city: 'Anytown',
        state: 'CA',
        postalCode: '12345',
        lat: 37.7749,
        lng: -122.4194,
      });
    });
  });
});

# Places Proxy Service

A secure, high-performance proxy service for Google Places API that provides autocomplete and details endpoints with built-in caching, rate limiting, and error handling.

## Features

- 🚀 **High Performance**: Built with Fastify and native Node.js fetch
- 🛡️ **Security**: Rate limiting, CORS protection, input validation
- 💾 **Smart Caching**: In-memory LRU cache with configurable TTL
- 🔄 **Resilient**: Soft-fail modes, timeout handling, retry logic
- 📊 **Observability**: Structured JSON logging with request tracing
- 🎯 **Type Safe**: Full TypeScript implementation

## Quick Start

### Prerequisites

- Node.js 20+
- Google Places API key with Places API enabled

### Installation

```bash
cd places-proxy
npm install
cp .env.example .env
```

### Configuration

Edit `.env` with your settings:

```bash
# Required
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here

# Optional - see .env.example for all options
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
PORT=8787
```

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## API Reference

Base URL: `http://localhost:8787/v1`

### Health Check

```bash
GET /v1/health
```

**Response:**
```json
{
  "status": "ok",
  "uptimeSeconds": 1234,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Autocomplete

```bash
GET /v1/places/autocomplete?q=123 Main St&sessionToken=abc123&limit=5
```

**Parameters:**
- `q` (required): Query string (3-120 characters)
- `sessionToken` (optional): Session token for billing optimization (max 64 chars)
- `limit` (optional): Number of results (1-10, default: 5)

**Response:**
```json
{
  "suggestions": [
    {
      "id": "ChIJ123...",
      "description": "123 Main Street, Anytown, State",
      "primaryText": "123 Main Street",
      "secondaryText": "Anytown, State"
    }
  ]
}
```

### Place Details

```bash
GET /v1/places/details/ChIJ123...?sessionToken=abc123
```

**Parameters:**
- `id` (required): Google Place ID (max 256 chars)
- `sessionToken` (optional): Session token for billing optimization

**Response:**
```json
{
  "id": "ChIJ123...",
  "addressLine1": "123 Main Street",
  "city": "Anytown",
  "state": "CA",
  "postalCode": "12345",
  "lat": 37.7749,
  "lng": -122.4194
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_PLACES_API_KEY` | - | **Required** Google Places API key |
| `PORT` | 8787 | Server port |
| `ALLOWED_ORIGINS` | - | Comma-separated CORS origins |
| `CACHE_AC_TTL_SECONDS` | 60 | Autocomplete cache TTL |
| `CACHE_DETAILS_TTL_SECONDS` | 86400 | Details cache TTL |
| `CACHE_MAX_ITEMS` | 2000 | Max cached items |
| `RATE_LIMIT_GLOBAL_MAX` | 300 | Global requests per window |
| `RATE_LIMIT_GLOBAL_WINDOW_SECONDS` | 300 | Global rate limit window |
| `RATE_LIMIT_IP_MAX` | 30 | Per-IP requests per window |
| `RATE_LIMIT_IP_WINDOW_SECONDS` | 60 | Per-IP rate limit window |
| `SOFT_FAIL_AUTOCOMPLETE` | false | Return empty results on upstream errors |
| `LOG_LEVEL` | info | Logging level (debug/info/warn/error) |
| `REQUEST_TIMEOUT_MS` | 2500 | Upstream request timeout |

## Frontend Integration

### Environment Variables

Add to your frontend `.env`:

```bash
VITE_PLACES_PROXY_BASE=http://localhost:8787/v1
```

### Usage Example

```typescript
// Frontend API client
class PlacesService {
  private baseUrl = import.meta.env.VITE_PLACES_PROXY_BASE;

  async autocomplete(query: string, sessionToken?: string) {
    const params = new URLSearchParams({ q: query });
    if (sessionToken) params.set('sessionToken', sessionToken);
    
    const response = await fetch(`${this.baseUrl}/places/autocomplete?${params}`);
    return response.json();
  }

  async getDetails(placeId: string, sessionToken?: string) {
    const params = sessionToken ? `?sessionToken=${sessionToken}` : '';
    const response = await fetch(`${this.baseUrl}/places/details/${placeId}${params}`);
    return response.json();
  }
}
```

## Error Handling

All errors follow a consistent format:

```json
{
  "error": "error_code",
  "message": "Human readable message",
  "retryAfterSeconds": 60,
  "retryable": true
}
```

**Error Codes:**
- `bad_request` - Invalid input parameters
- `not_found` - Resource not found
- `rate_limited` - Rate limit exceeded
- `upstream_error` - Google API error
- `internal_error` - Unexpected server error

## Deployment on Replit

1. Create a new Node.js Repl
2. Copy all files from `places-proxy/` to your Repl
3. Add your `GOOGLE_PLACES_API_KEY` to Replit Secrets
4. Set other environment variables as needed
5. Run `npm install && npm run build && npm start`

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run specific test
npm test -- autocomplete
```

## Monitoring

The service provides structured JSON logs for monitoring:

```json
{
  "level": "info",
  "ts": "2024-01-15T10:30:00.000Z",
  "message": "Autocomplete request completed",
  "reqId": "abc12345",
  "method": "GET",
  "path": "/v1/places/autocomplete",
  "status": 200,
  "latencyMs": 45,
  "cacheHit": false,
  "ip": "127.0.0.1"
}
```

## Security Considerations

- API keys are never logged or exposed in responses
- Query parameters are truncated in logs after 40 characters
- CORS is strictly enforced based on `ALLOWED_ORIGINS`
- Rate limiting prevents abuse
- Input validation prevents injection attacks
- Request timeouts prevent resource exhaustion

## License

MIT License - see LICENSE file for details

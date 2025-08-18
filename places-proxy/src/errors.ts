import type { ErrorResponse } from './types.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    message: string,
    public retryable: boolean = false,
    public retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'bad_request', message);
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number) {
    super(429, 'rate_limited', 'Rate limit exceeded', false, retryAfterSeconds);
  }
}

export class UpstreamError extends AppError {
  constructor(message: string, retryable: boolean = true) {
    super(502, 'upstream_error', message, retryable);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, 'not_found', message);
  }
}

export function toErrorResponse(error: AppError): ErrorResponse {
  const response: ErrorResponse = {
    error: error.errorCode,
    message: error.message,
  };

  if (error.retryAfterSeconds !== undefined) {
    response.retryAfterSeconds = error.retryAfterSeconds;
  }

  if (error.retryable) {
    response.retryable = error.retryable;
  }

  return response;
}
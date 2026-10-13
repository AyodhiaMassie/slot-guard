import type { ErrorRequestHandler } from 'express';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function isDatabaseError(error: unknown): error is { code: string; constraint?: string } {
  return typeof error === 'object' && error !== null && 'code' in error
    && typeof error.code === 'string';
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  let apiError: ApiError;
  if (error instanceof ApiError) {
    apiError = error;
  } else if (isDatabaseError(error) && error.code === '23505') {
    apiError = new ApiError(409, 'CONFLICT', 'The slot or reservation already exists.');
  } else if (isDatabaseError(error) && error.code === '23514'
    && ['booking_slot_available', 'slot_has_confirmed_booking', 'booking_cancellation_future', 'slot_future']
      .includes(error.constraint ?? '')) {
    apiError = new ApiError(409, 'CONFLICT', 'This appointment is no longer available for that action.');
  } else if (typeof error === 'object' && error !== null && 'type' in error
    && error.type === 'entity.parse.failed') {
    apiError = new ApiError(400, 'INVALID_JSON', 'The request body must contain valid JSON.');
  } else if (typeof error === 'object' && error !== null && 'type' in error
    && error.type === 'entity.too.large') {
    apiError = new ApiError(413, 'BODY_TOO_LARGE', 'The request body is too large.');
  } else if (error instanceof URIError) {
    apiError = new ApiError(400, 'INVALID_URL', 'The request URL is malformed.');
  } else {
    // Log classifications only: driver messages can contain SQL, credentials, or user input.
    console.error('Request failed', {
      type: error instanceof Error ? error.name : 'UnknownError',
      code: isDatabaseError(error) ? error.code : undefined,
    });
    apiError = new ApiError(500, 'INTERNAL_ERROR', 'An unexpected server error occurred.');
  }
  response.status(apiError.status).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details === undefined ? {} : { details: apiError.details }),
    },
  });
};

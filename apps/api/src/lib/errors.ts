export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
  }
}

export function badRequest(message: string, details?: unknown) {
  return new AppError('BAD_REQUEST', message, 400, details);
}

export function validationError(message: string, details?: unknown) {
  return new AppError('VALIDATION_ERROR', message, 400, details);
}

export function unauthorized(message = 'Authentication required') {
  return new AppError('UNAUTHORIZED', message, 401);
}

export function forbidden(message = 'Insufficient permissions') {
  return new AppError('FORBIDDEN', message, 403);
}

export function notFound(message = 'Resource not found') {
  return new AppError('NOT_FOUND', message, 404);
}

export function conflict(message: string, details?: unknown) {
  return new AppError('CONFLICT', message, 409, details);
}

import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { sendError } from '../lib/response';
import { env } from '../config/env';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(new AppError('NOT_FOUND', 'Route not found', 404));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return sendError(res, err.statusCode, {
      code: err.code,
      message: err.message,
      details: err.details,
    });
  }

  if (err instanceof ZodError) {
    return sendError(res, 400, {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      details: err.flatten(),
    });
  }

  console.error(err);

  return sendError(res, 500, {
    code: 'INTERNAL_ERROR',
    message:
      env.NODE_ENV === 'production' ? 'An unexpected error occurred' : (err as Error).message,
    details: env.NODE_ENV === 'production' ? undefined : (err as Error).stack,
  });
}

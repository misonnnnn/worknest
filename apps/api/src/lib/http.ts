import type { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { validationError } from './errors';

type RequestPart = 'body' | 'query' | 'params';

export function validateRequest(schema: ZodSchema, part: RequestPart = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      return next(
        validationError('Invalid request', result.error.flatten()),
      );
    }
    req[part] = result.data;
    return next();
  };
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

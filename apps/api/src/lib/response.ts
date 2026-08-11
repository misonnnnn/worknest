import type { Response } from 'express';
import type { ApiErrorBody, ApiSuccessResponse } from '@worknest/types';

export function sendSuccess<T>(res: Response, data: T, statusCode = 200) {
  const body: ApiSuccessResponse<T> = { success: true, data };
  return res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  statusCode: number,
  error: ApiErrorBody,
) {
  return res.status(statusCode).json({ success: false, error });
}

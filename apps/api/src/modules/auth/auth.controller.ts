import type { Request, Response } from 'express';
import { authService } from './auth.service';
import { sendSuccess } from '../../lib/response';
import { getClientMeta } from '../../utils/helpers';

export const authController = {
  async login(req: Request, res: Response) {
    const { email, password } = req.body as { email: string; password: string };
    const result = await authService.login(email, password, getClientMeta(req));
    return sendSuccess(res, result);
  },

  async refresh(req: Request, res: Response) {
    const { refreshToken } = req.body as { refreshToken: string };
    const tokens = await authService.refresh(refreshToken);
    return sendSuccess(res, tokens);
  },

  async logout(req: Request, res: Response) {
    const { refreshToken } = (req.body ?? {}) as { refreshToken?: string };
    await authService.logout(req.user!.id, refreshToken, getClientMeta(req));
    return sendSuccess(res, { message: 'Logged out' });
  },

  async me(req: Request, res: Response) {
    const user = await authService.me(req.user!.id);
    return sendSuccess(res, user);
  },
};

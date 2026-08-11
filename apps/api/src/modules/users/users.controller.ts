import type { Request, Response } from 'express';
import { usersService } from './users.service';
import { sendSuccess } from '../../lib/response';
import { getClientMeta } from '../../utils/helpers';

export const usersController = {
  async list(req: Request, res: Response) {
    const data = await usersService.list(req.query as never);
    return sendSuccess(res, data);
  },

  async get(req: Request, res: Response) {
    const data = await usersService.getById(req.params.id!);
    return sendSuccess(res, data);
  },

  async create(req: Request, res: Response) {
    const data = await usersService.create(req.body, req.user!.id, getClientMeta(req));
    return sendSuccess(res, data, 201);
  },

  async update(req: Request, res: Response) {
    const data = await usersService.update(req.params.id!, req.body, req.user!.id, getClientMeta(req));
    return sendSuccess(res, data);
  },

  async remove(req: Request, res: Response) {
    const data = await usersService.remove(req.params.id!, req.user!.id, getClientMeta(req));
    return sendSuccess(res, data);
  },

  async assignRoles(req: Request, res: Response) {
    const data = await usersService.assignRoles(
      req.params.id!,
      req.body.roleIds,
      req.user!.id,
      getClientMeta(req),
    );
    return sendSuccess(res, data);
  },
};

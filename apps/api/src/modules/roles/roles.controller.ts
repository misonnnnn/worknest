import type { Request, Response } from 'express';
import { rolesService } from './roles.service';
import { sendSuccess } from '../../lib/response';
import { getClientMeta } from '../../utils/helpers';

export const rolesController = {
  async list(req: Request, res: Response) {
    return sendSuccess(res, await rolesService.list(req.query as never));
  },
  async get(req: Request, res: Response) {
    return sendSuccess(res, await rolesService.getById(req.params.id!));
  },
  async create(req: Request, res: Response) {
    return sendSuccess(
      res,
      await rolesService.create(req.body, req.user!.id, getClientMeta(req)),
      201,
    );
  },
  async update(req: Request, res: Response) {
    return sendSuccess(
      res,
      await rolesService.update(req.params.id!, req.body, req.user!.id, getClientMeta(req)),
    );
  },
  async remove(req: Request, res: Response) {
    return sendSuccess(
      res,
      await rolesService.remove(req.params.id!, req.user!.id, getClientMeta(req)),
    );
  },
  async setPermissions(req: Request, res: Response) {
    return sendSuccess(
      res,
      await rolesService.setPermissions(
        req.params.id!,
        req.body.permissionIds,
        req.user!.id,
        getClientMeta(req),
      ),
    );
  },
};

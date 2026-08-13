import { z } from 'zod';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';
import { sendSuccess } from '../../lib/response';
import { askGemini } from './gemini';

export const MAX_CHAT_MESSAGE_LENGTH = 2000;

const historyItemSchema = z.object({
  role: z.enum(['user', 'model']),
  content: z
    .string()
    .trim()
    .min(1, 'History content cannot be empty')
    .max(MAX_CHAT_MESSAGE_LENGTH, `History content must be at most ${MAX_CHAT_MESSAGE_LENGTH} characters`),
});

const chatSchema = z.object({
  message: z
    .string({ required_error: 'Message is required' })
    .trim()
    .min(1, 'Message cannot be empty')
    .max(MAX_CHAT_MESSAGE_LENGTH, `Message must be at most ${MAX_CHAT_MESSAGE_LENGTH} characters`),
  history: z.array(historyItemSchema).max(40).optional().default([]),
});

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /api/ai/chat:
 *   post:
 *     tags: [AI]
 *     summary: Ask the ERP assistant a general question
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string, maxLength: 2000 }
 *               history:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [role, content]
 *                   properties:
 *                     role: { type: string, enum: [user, model] }
 *                     content: { type: string }
 *     responses:
 *       200:
 *         description: Assistant reply
 */
router.post(
  '/chat',
  validateRequest(chatSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const reply = await askGemini(req.body.message, req.body.history);
    return sendSuccess(res, { message: reply });
  }),
);

export default router;

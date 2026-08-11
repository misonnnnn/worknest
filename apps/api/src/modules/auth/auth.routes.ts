import { Router } from 'express';
import { authController } from './auth.controller';
import { loginSchema, logoutSchema, refreshSchema } from './auth.schema';
import { asyncHandler, validateRequest } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';

const router = Router();

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Tokens and user profile
 */
router.post('/login', validateRequest(loginSchema), asyncHandler(authController.login));

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 */
router.post('/refresh', validateRequest(refreshSchema), asyncHandler(authController.refresh));

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout and revoke refresh token
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/logout',
  requireAuth,
  validateRequest(logoutSchema),
  asyncHandler(authController.logout),
);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Current authenticated user
 *     security:
 *       - bearerAuth: []
 */
router.get('/me', requireAuth, asyncHandler(authController.me));

export default router;

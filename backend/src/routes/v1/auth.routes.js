const express = require('express');
const authController = require('../../controllers/auth.controller');
const { requireAuth } = require('../../middlewares/authentication');
const { validateRequest } = require('../../middlewares/validate-request');
const { loginWithGoogleBodySchema } = require('../../schemas/auth.schema');

const router = express.Router();

/**
 * @openapi
 * /api/v1/auth/login/google:
 *   post:
 *     summary: Authenticate using a Google ID token
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AuthGoogleLoginRequest'
 *           examples:
 *             login:
 *               value:
 *                 idToken: ya29.a0AfH6SMCg...
 *     responses:
 *       '200':
 *         description: Login realizado com sucesso
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *             description: Cookie de sessão emitido após autenticação bem-sucedida.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AuthSession'
 *             examples:
 *               success:
 *                 value:
 *                   success: true
 *                   data:
 *                     email: user@example.com
 *                     role: editor
 *                     expiresAt: '2025-01-20T13:45:00.000Z'
 *                   meta:
 *                     requestId: 00000000-0000-4000-8000-000000000010
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/login/google', validateRequest({ body: loginWithGoogleBodySchema }), authController.loginWithGoogle);

/**
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     summary: Invalidate the current session
 *     tags:
 *       - Auth
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     responses:
 *       '200':
 *         description: Logout efetuado
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AuthLogoutResult'
 *             examples:
 *               success:
 *                 value:
 *                   success: true
 *                   data:
 *                     message: Logged out
 *                   meta:
 *                     requestId: 00000000-0000-4000-8000-000000000011
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/logout', requireAuth, authController.logout);

/**
 * @openapi
 * /api/v1/auth/me:
 *   get:
 *     summary: Retrieve the authenticated user session
 *     tags:
 *       - Auth
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     responses:
 *       '200':
 *         description: Sessão válida
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AuthSession'
 *             examples:
 *               me:
 *                 value:
 *                   success: true
 *                   data:
 *                     email: user@example.com
 *                     role: editor
 *                     expiresAt: '2025-01-20T13:45:00.000Z'
 *                   meta:
 *                     requestId: 00000000-0000-4000-8000-000000000012
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/me', requireAuth, authController.getCurrentUser);

/**
 * @openapi
 * /api/v1/auth/debug:
 *   get:
 *     summary: Inspect authentication cookies (feature flag controlled)
 *     tags:
 *       - Auth
 *     responses:
 *       '200':
 *         description: Detalhes sobre o estado de autenticação detectado
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AuthDebugReport'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/debug', authController.debugAuth);

module.exports = router;

const express = require('express');
const helloController = require('../../controllers/hello.controller');
const asyncHandler = require('../../utils/async-handler');

const router = express.Router();

/**
 * @openapi
 * /api/v1/hello:
 *   get:
 *     summary: Returns the hello message
 *     tags:
 *       - Hello
 *     responses:
 *       '200':
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: hello mundo
 *                 meta:
 *                   type: object
 *                   properties:
 *                     requestId:
 *                       type: string
 */
router.get('/hello', asyncHandler(helloController.getHello));

module.exports = router;

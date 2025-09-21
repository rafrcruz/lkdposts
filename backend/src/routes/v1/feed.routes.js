const express = require('express');
const feedController = require('../../controllers/feed.controller');

const router = express.Router();

/**
 * @openapi
 * /api/v1/feeds:
 *   get:
 *     summary: List RSS feeds owned by the authenticated user
 *     tags:
 *       - Feeds
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *           description: Cursor pointing to the last feed received in the previous page
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Maximum number of feeds to return per request
 *     responses:
 *       '200':
 *         description: Paginated list of feeds
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         items:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/Feed'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         nextCursor:
 *                           type: string
 *                           nullable: true
 *                         total:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *   post:
 *     summary: Create a new RSS feed for the authenticated user
 *     tags:
 *       - Feeds
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *               title:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       '201':
 *         description: Feed created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Feed'
 */
router.get('/feeds', feedController.list);
router.post('/feeds', feedController.create);

/**
 * @openapi
 * /api/v1/feeds/bulk:
 *   post:
 *     summary: Create multiple RSS feeds in a single request
 *     tags:
 *       - Feeds
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - urls
 *             properties:
 *               urls:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *     responses:
 *       '200':
 *         description: Result of the bulk creation request
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/FeedBulkResult'
 */
router.post('/feeds/bulk', feedController.bulkCreate);

/**
 * @openapi
 * /api/v1/feeds/{id}:
 *   patch:
 *     summary: Update attributes of an existing feed
 *     tags:
 *       - Feeds
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *               title:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       '200':
 *         description: Feed updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Feed'
 *   delete:
 *     summary: Remove a feed owned by the authenticated user
 *     tags:
 *       - Feeds
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       '200':
 *         description: Feed removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 */
router.patch('/feeds/:id', feedController.update);
router.delete('/feeds/:id', feedController.remove);

module.exports = router;

const express = require('express');
const authRoutes = require('./auth.routes');
const helloRoutes = require('./hello.routes');
const feedRoutes = require('./feed.routes');
const allowlistRoutes = require('./allowlist.routes');
const { requireAuth } = require('../../middlewares/authentication');
const { requireRole, ROLES } = require('../../middlewares/authorization');

const router = express.Router();

router.use('/auth', authRoutes);
router.use(requireAuth);
router.use(helloRoutes);
router.use(feedRoutes);
router.use('/allowlist', requireRole(ROLES.ADMIN), allowlistRoutes);

module.exports = router;

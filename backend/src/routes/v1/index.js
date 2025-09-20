const express = require('express');
const helloRoutes = require('./hello.routes');
const authRoutes = require('./auth.routes');
const allowlistRoutes = require('./allowlist.routes');
const { requireAuth } = require('../../middlewares/authentication');
const { requireRole, ROLES } = require('../../middlewares/authorization');

const router = express.Router();

router.use('/auth', authRoutes);
router.use(helloRoutes);
router.use(requireAuth);
router.use('/allowlist', requireRole(ROLES.ADMIN), allowlistRoutes);

module.exports = router;

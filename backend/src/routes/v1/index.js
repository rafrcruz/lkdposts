const express = require('express');
const authRoutes = require('./auth.routes');
const helloRoutes = require('./hello.routes');
const feedRoutes = require('./feed.routes');
const postsRoutes = require('./posts.routes');
const promptsRoutes = require('./prompts.routes');
const appParamsRoutes = require('./app-params.routes');
const allowlistRoutes = require('./allowlist.routes');
const diagnosticsRoutes = require('./diagnostics.routes');
const { requireAuth } = require('../../middlewares/authentication');
const { requireRole, ROLES } = require('../../middlewares/authorization');

const router = express.Router();

router.use('/auth', authRoutes);
router.use(requireAuth);
router.use(helloRoutes);
router.use(feedRoutes);
router.use(postsRoutes);
router.use(promptsRoutes);
router.use('/app-params', appParamsRoutes);
router.use('/allowlist', requireRole(ROLES.ADMIN), allowlistRoutes);
router.use('/diagnostics', requireRole(ROLES.ADMIN), diagnosticsRoutes);

module.exports = router;

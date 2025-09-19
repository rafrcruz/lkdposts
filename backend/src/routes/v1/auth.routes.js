const express = require('express');
const authController = require('../../controllers/auth.controller');
const { requireAuth } = require('../../middlewares/authentication');

const router = express.Router();

router.post('/login/google', authController.loginWithGoogle);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.getCurrentUser);

module.exports = router;

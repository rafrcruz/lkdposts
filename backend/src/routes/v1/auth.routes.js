const express = require('express');
const authController = require('../../controllers/auth.controller');
const { requireAuth } = require('../../middlewares/authentication');
const { validateRequest } = require('../../middlewares/validate-request');
const { loginWithGoogleBodySchema } = require('../../schemas/auth.schema');

const router = express.Router();

router.post('/login/google', validateRequest({ body: loginWithGoogleBodySchema }), authController.loginWithGoogle);
router.post('/logout', requireAuth, authController.logout);
router.get('/me', requireAuth, authController.getCurrentUser);
router.get('/debug', authController.debugAuth);

module.exports = router;

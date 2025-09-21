const express = require('express');

const postsController = require('../../controllers/posts.controller');

const router = express.Router();

router.post('/posts/refresh', postsController.refresh);
router.post('/posts/cleanup', postsController.cleanup);
router.get('/posts', postsController.list);

module.exports = router;

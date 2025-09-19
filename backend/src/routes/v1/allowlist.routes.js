const express = require('express');
const allowlistController = require('../../controllers/allowlist.controller');

const router = express.Router();

router.get('/', allowlistController.list);
router.post('/', allowlistController.create);
router.patch('/:id', allowlistController.updateRole);
router.delete('/:id', allowlistController.remove);

module.exports = router;

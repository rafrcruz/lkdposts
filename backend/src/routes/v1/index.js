const express = require('express');
const helloRoutes = require('./hello.routes');

const router = express.Router();

router.use(helloRoutes);

module.exports = router;

const path = require('node:path');
const fs = require('node:fs/promises');
const express = require('express');

const config = require('../config');
const { runTraceroute } = require('../collectors/traceroute');
const { insertTracerouteRun, findTracerouteRunById } = require('../db');

const app = express();

app.use(express.json({ limit: '64kb' }));

const publicDir = path.join(__dirname, '../../public');
const indexHtmlPath = path.join(publicDir, 'index.html');

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

app.get('/', async (req, res, next) => {
  try {
    const htmlTemplate = await fs.readFile(indexHtmlPath, 'utf8');
    const html = htmlTemplate
      .replace(/__DEFAULT_TARGET__/g, escapeHtml(config.traceroute.defaultTarget))
      .replace(/__MAX_HOPS__/g, String(config.traceroute.maxHops));
    res.type('html').send(html);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(publicDir, { extensions: ['html'] }));

app.post('/actions/traceroute', async (req, res) => {
  try {
    const { target, maxHops, timeoutMs } = req.body || {};
    const result = await runTraceroute(target, {
      maxHops,
      timeoutMs,
    });
    const id = insertTracerouteRun(result);
    res.json({ id, ts: result.ts, target: result.target, success: result.success });
  } catch (error) {
    console.error('Failed to run traceroute', error);
    res.status(500).json({ error: 'FAILED_TO_RUN_TRACEROUTE' });
  }
});

app.get('/api/traceroute/:id', (req, res) => {
  const entry = findTracerouteRunById(req.params.id);
  if (!entry) {
    return res.status(404).json({ error: 'TRACEROUTE_NOT_FOUND' });
  }
  return res.json(entry);
});

app.use((err, req, res, next) => {
  console.error('Unhandled error', err);
  res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
});

module.exports = app;

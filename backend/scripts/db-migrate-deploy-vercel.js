#!/usr/bin/env node
const { spawn } = require('child_process');

const env = { ...process.env };

delete env.PRISMA_URL;
env.PRISMA_FORCE_DIRECT = '1';

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(command, ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('Failed to run prisma migrate deploy', error);
  process.exit(1);
});

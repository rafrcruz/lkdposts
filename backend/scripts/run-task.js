#!/usr/bin/env node
const { spawn } = require('node:child_process');

const tasks = {
  dev: ['npm', ['run', 'dev']],
  test: ['npm', ['test']],
  build: ['npm', ['run', 'build']],
  docs: ['npm', ['run', 'docs:generate']],
};

const task = process.argv[2];

if (!task || !tasks[task]) {
  console.error('Usage: node scripts/run-task.js <dev|test|build|docs>');
  process.exit(1);
}

const [command, args] = tasks[task];
const child = spawn(command, args, { stdio: 'inherit', shell: true });

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

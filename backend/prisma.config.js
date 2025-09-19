const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { defineConfig } = require('prisma/config');

const envFiles = ['.env'];
const nodeEnv = process.env.NODE_ENV;
if (nodeEnv && nodeEnv.trim() !== '') {
  envFiles.push(`.env.${nodeEnv}`);
}

envFiles.forEach((relativePath) => {
  const absolutePath = path.resolve(__dirname, relativePath);
  if (fs.existsSync(absolutePath)) {
    dotenv.config({ path: absolutePath, override: true });
  }
});

if (process.env.PRISMA_FORCE_DIRECT === '1') {
  delete process.env.PRISMA_URL;
}

module.exports = defineConfig({
  schema: './prisma/schema.prisma',
  seed: 'node prisma/seed.js',
});

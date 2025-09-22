const path = require('node:path');
const fs = require('node:fs');
const dotenv = require('dotenv');
const { defineConfig } = require('prisma/config');

const envFiles = ['.env'];
const nodeEnv = process.env.NODE_ENV;
if (nodeEnv && nodeEnv.trim() !== '') {
  envFiles.push(`.env.${nodeEnv}`);
}

for (const relativePath of envFiles) {
  const absolutePath = path.resolve(__dirname, relativePath);
  if (fs.existsSync(absolutePath)) {
    dotenv.config({ path: absolutePath, override: process.env.PRISMA_FORCE_DIRECT !== '1' });
  }
}

dotenv.config({ override: process.env.PRISMA_FORCE_DIRECT !== '1' });

if (process.env.PRISMA_FORCE_DIRECT === '1') {
  delete process.env.PRISMA_URL;
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('-pooler.')) {
    process.env.DATABASE_URL = process.env.DATABASE_URL.replace('-pooler.', '.');
  }
}

module.exports = defineConfig({
  schema: './prisma/schema.prisma',
  seed: 'node prisma/seed.js',
});

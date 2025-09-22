#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { Client } = require('pg');
const dotenv = require('dotenv');

const envFiles = ['.env'];
const nodeEnv = process.env.NODE_ENV;
if (nodeEnv && nodeEnv.trim() !== '') {
  envFiles.push(`.env.${nodeEnv}`);
}

envFiles.forEach((relativePath) => {
  const absolutePath = path.resolve(__dirname, '..', relativePath);
  if (fs.existsSync(absolutePath)) {
    dotenv.config({ path: absolutePath, override: false });
  }
});

dotenv.config({ override: false });

const isTruthy = (value) => {
  if (!value) return false;
  const normalized = String(value).toLowerCase();
  return ['1', 'true', 'yes'].includes(normalized);
};

const isRunningOnVercel = () => isTruthy(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV) || Boolean(process.env.VERCEL_URL);

if (!isRunningOnVercel() && !isTruthy(process.env.FORCE_DB_MIGRATE)) {
  console.info('Skipping Prisma migrate deploy because this script is not running inside a Vercel build.');
  console.info('Set FORCE_DB_MIGRATE=1 to force execution.');
  process.exit(0);
}

const toDirectConnectionString = (connectionString) => {
  const protocolPrefix = connectionString.startsWith('postgresql://') ? 'postgresql://' : 'postgres://';
  const adjusted = connectionString.replace('postgresql://', 'postgres://');
  const url = new URL(adjusted);

  if (url.hostname.includes('-pooler.')) {
    url.hostname = url.hostname.replace('-pooler.', '.');
  }

  const rebuilt = `${protocolPrefix}${url.username}${url.password ? `:${url.password}` : ''}@${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}${url.search}`;
  return rebuilt;
};

const parseConnectionString = (connectionString) => {
  try {
    const adjusted = connectionString.replace('postgresql://', 'postgres://');
    const url = new URL(adjusted);

    const config = {
      user: url.username,
      password: url.password,
      host: url.hostname,
      port: url.port ? Number(url.port) : 5432,
      database: url.pathname?.slice(1),
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    };

    url.searchParams.forEach((value, key) => {
      if (key === 'sslmode' && value === 'require') {
        config.ssl = { rejectUnauthorized: false };
      }
    });

    return config;
  } catch (error) {
    throw new Error('Invalid direct database URL; unable to parse connection string');
  }
};

const warmupDatabase = async (connectionString) => {
  console.info('warming up database connection');
  const connectionConfig = parseConnectionString(connectionString);
  const client = new Client(connectionConfig);

  try {
    await client.connect();
    await client.query('SELECT 1');
    console.info('warmup ok');
  } catch (error) {
    console.error('database warmup failed', error);
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runMigrate = async (directUrl) => {
  const delays = [0, 5000, 10000, 20000];

  for (let attempt = 1; attempt <= delays.length; attempt += 1) {
    console.info(`prisma migrate deploy try ${attempt}/${delays.length}`);

    const env = {
      ...process.env,
      PRISMA_FORCE_DIRECT: '1',
      PRISMA_MIGRATION_ENGINE_ADVISORY_LOCK_TIMEOUT: '60000',
      DATABASE_URL: directUrl,
    };
    delete env.PRISMA_URL;

    console.info(`using advisory lock timeout ${env.PRISMA_MIGRATION_ENGINE_ADVISORY_LOCK_TIMEOUT}ms`);

    const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';

    const exitCode = await new Promise((resolve) => {
      const child = spawn(command, ['prisma', 'migrate', 'deploy'], {
        stdio: 'inherit',
        env,
      });

      child.on('exit', (code) => resolve(code ?? 0));
      child.on('error', (error) => {
        console.error('Failed to start prisma migrate deploy', error);
        resolve(1);
      });
    });

    if (exitCode === 0) {
      return;
    }

    if (attempt < delays.length) {
      const delay = delays[attempt];
      console.warn(`migration attempt ${attempt} failed, retrying in ${delay / 1000}s...`);
      await sleep(delay);
    } else {
      throw new Error('prisma migrate deploy failed after retries');
    }
  }
};

(async () => {
  try {
    const rawDirect = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
    if (!rawDirect) {
      throw new Error('DIRECT_DATABASE_URL or DATABASE_URL must be provided for migrations');
    }

    const directUrl = toDirectConnectionString(rawDirect);
    const directHost = new URL(directUrl.replace('postgresql://', 'postgres://')).hostname;
    console.info(`using direct database host ${directHost}`);

    await warmupDatabase(directUrl);
    await runMigrate(directUrl);
  } catch (error) {
    console.error('Migration deploy failed', error);
    process.exit(1);
  }
})();

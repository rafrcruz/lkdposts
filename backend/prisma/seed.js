const { PrismaClient } = require('@prisma/client');
const config = require('../src/config');
const { ROLES } = require('../src/constants/roles');
const { OPENAI_MODEL_OPTIONS, DEFAULT_OPENAI_MODEL } = require('../src/services/app-params.service');

const prisma = new PrismaClient();

const ensureHelloMessage = async () => {
  const defaultMessage = 'hello mundo';

  const existing = await prisma.helloMessage.findFirst({
    where: { message: defaultMessage },
  });

  if (!existing) {
    await prisma.helloMessage.create({
      data: {
        message: defaultMessage,
      },
    });
  }
};

const ensureSuperAdmin = async () => {
  const email = config.auth?.superAdminEmail?.trim().toLowerCase();

  if (!email) {
    console.warn('SUPERADMIN_EMAIL is not defined; skipping super admin seed step.');
    return;
  }

  await prisma.allowedUser.upsert({
    where: { email },
    update: { role: ROLES.ADMIN },
    create: { email, role: ROLES.ADMIN },
  });
};

const SUPPORTED_OPENAI_MODELS = new Set(OPENAI_MODEL_OPTIONS);

const normalizeOpenAiModel = (value) => {
  if (typeof value !== 'string') {
    return DEFAULT_OPENAI_MODEL;
  }

  const normalized = value.trim();
  if (!SUPPORTED_OPENAI_MODELS.has(normalized)) {
    return DEFAULT_OPENAI_MODEL;
  }

  return normalized;
};

const ensureAppParams = async () => {
  const existing = await prisma.appParams.findFirst();

  if (existing) {
    const normalized = normalizeOpenAiModel(existing.openAiModel);

    if (normalized !== existing.openAiModel) {
      return prisma.appParams.update({
        where: { id: existing.id },
        data: { openAiModel: normalized },
      });
    }

    return existing;
  }

  return prisma.appParams.create({
    data: {
      id: 1,
      postsRefreshCooldownSeconds: 3600,
      postsTimeWindowDays: 7,
      openAiModel: DEFAULT_OPENAI_MODEL,
    },
  });
};

const run = async () => {
  try {
    await ensureHelloMessage();
    await ensureSuperAdmin();
    await ensureAppParams();
  } catch (error) {
    console.error('Failed to seed database:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

void run();


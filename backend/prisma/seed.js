const { PrismaClient } = require('@prisma/client');
const config = require('../src/config');
const { ROLES } = require('../src/constants/roles');

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

const ensureAppParams = async () => {
  const existing = await prisma.appParams.findFirst();

  if (existing) {
    return existing;
  }

  return prisma.appParams.create({
    data: {
      id: 1,
      postsRefreshCooldownSeconds: 3600,
      postsTimeWindowDays: 7,
      openAiModel: 'gpt-5-nano',
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


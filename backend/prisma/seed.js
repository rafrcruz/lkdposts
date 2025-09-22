const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
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
}

const run = async () => {
  try {
    await main();
  } catch (error) {
    console.error('Failed to seed database:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

void run();


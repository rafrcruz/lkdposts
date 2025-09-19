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

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Failed to seed database:', error);
    await prisma.$disconnect();
    process.exit(1);
  });


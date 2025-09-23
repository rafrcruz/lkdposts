const allowlistService = require('../src/services/allowlist.service');
const { prisma } = require('../src/lib/prisma');
const config = require('../src/config');
const { ROLES } = require('../src/constants/roles');

const superAdminEmail = config.auth.superAdminEmail;
const normalizedSuperAdminEmail = allowlistService.normalizeEmail(superAdminEmail);

describe('allowlist.service', () => {
  beforeEach(() => {
    prisma.__reset();
  });

  it('recreates the super admin entry if it is missing', async () => {
    await prisma.allowedUser.deleteMany({ where: { email: normalizedSuperAdminEmail } });

    const firstLookup = await allowlistService.findAllowedUserByEmail(superAdminEmail);
    expect(firstLookup).toEqual(
      expect.objectContaining({ email: normalizedSuperAdminEmail, role: ROLES.ADMIN })
    );

    await prisma.allowedUser.deleteMany({ where: { email: normalizedSuperAdminEmail } });

    const recreated = await allowlistService.findAllowedUserByEmail(superAdminEmail);
    expect(recreated).toEqual(
      expect.objectContaining({ email: normalizedSuperAdminEmail, role: ROLES.ADMIN })
    );
  });

  it('does not create allowlist entries for other emails', async () => {
    await prisma.allowedUser.deleteMany({});

    const result = await allowlistService.findAllowedUserByEmail('not-allowed@example.com');
    expect(result).toBeNull();
  });
});

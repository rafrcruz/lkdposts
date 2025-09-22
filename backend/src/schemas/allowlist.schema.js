const { z } = require('zod');
const { ROLES } = require('../constants/roles');

const positiveInt = z.coerce.number().int().positive();
const roleEnum = z.enum(Object.values(ROLES));

const listAllowlistQuerySchema = z
  .object({
    cursor: positiveInt.optional(),
    limit: positiveInt.optional(),
  })
  .strict();

const createAllowlistBodySchema = z
  .object({
    email: z.string().email().transform((value) => value.trim().toLowerCase()),
    role: roleEnum.optional().default(ROLES.USER),
  })
  .strict();

const updateAllowlistRoleBodySchema = z
  .object({
    role: roleEnum,
  })
  .strict();

const allowlistParamsSchema = z
  .object({
    id: positiveInt,
  })
  .strict();

module.exports = {
  listAllowlistQuerySchema,
  createAllowlistBodySchema,
  updateAllowlistRoleBodySchema,
  allowlistParamsSchema,
};

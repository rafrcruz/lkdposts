const { z } = require('zod');

const promptIdParamSchema = z.object({
  id: z.string().uuid(),
});

const promptListQuerySchema = z
  .object({
    limit: z
      .string()
      .optional()
      .transform((value) => (value == null ? undefined : Number(value)))
      .pipe(z.number().int().positive().max(100).optional()),
    offset: z
      .string()
      .optional()
      .transform((value) => (value == null ? undefined : Number(value)))
      .pipe(z.number().int().min(0).optional()),
  })
  .optional()
  .default({});

const promptCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().min(1),
  position: z.number().int().min(0).optional(),
});

const promptUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    content: z.string().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
    path: [],
  });

const promptReorderItemSchema = z.object({
  id: z.string().uuid(),
  position: z.number().int().min(0),
});

const promptReorderSchema = z.object({
  items: z.array(promptReorderItemSchema).min(1),
});

module.exports = {
  promptIdParamSchema,
  promptListQuerySchema,
  promptCreateSchema,
  promptUpdateSchema,
  promptReorderSchema,
  promptReorderItemSchema,
};

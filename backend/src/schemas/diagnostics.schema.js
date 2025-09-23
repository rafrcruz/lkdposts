const { z } = require('zod');

const ingestionDiagnosticsQuerySchema = z.object({
  limit: z
    .preprocess((value) => {
      if (value == null || value === '') {
        return undefined;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }, z.number().int().min(1).max(200).optional()),
  feedId: z
    .preprocess((value) => {
      if (value == null || value === '') {
        return undefined;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }, z.number().int().positive().optional()),
});

module.exports = {
  ingestionDiagnosticsQuerySchema,
};

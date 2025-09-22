const { z } = require('zod');

const loginWithGoogleBodySchema = z
  .object({
    idToken: z.string().min(10, 'Google ID token is required').max(4096).transform((value) => value.trim()),
  })
  .strict();

module.exports = {
  loginWithGoogleBodySchema,
};

const asyncHandler = require('../../utils/async-handler');
const ApiError = require('../../utils/api-error');
const postGenerationService = require('../../services/post-generation.service');

const getOwnerKey = (req) => {
  if (!req.user || req.user.id == null) {
    throw new ApiError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication required' });
  }

  return String(req.user.id);
};

const triggerGeneration = asyncHandler(async (req, res) => {
  const ownerKey = getOwnerKey(req);
  const summary = await postGenerationService.generatePostsForOwner({ ownerKey });

  return res.success({
    ownerKey,
    summary,
  });
});

const getStatus = asyncHandler(async (req, res) => {
  const ownerKey = getOwnerKey(req);
  const status = postGenerationService.getLatestStatus(ownerKey);

  return res.success({
    ownerKey,
    status: status ?? null,
  });
});

module.exports = {
  triggerGeneration,
  getStatus,
};


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

const previewPayload = asyncHandler(async (req, res) => {
  const ownerKey = getOwnerKey(req);
  const { newsId } = req.validated?.query ?? {};

  try {
    const preview = await postGenerationService.buildPostRequestPreview({
      ownerKey,
      newsId,
    });

    return res.success({
      prompt_base: preview.promptBase,
      prompt_base_hash: preview.promptBaseHash,
      news_payload: preview.newsPayload,
      model: preview.model,
    });
  } catch (error) {
    if (error instanceof postGenerationService.ArticleNotFoundError) {
      throw new ApiError({ statusCode: 404, code: 'NEWS_NOT_FOUND', message: 'News item not found' });
    }

    throw error;
  }
});

const previewOpenAI = asyncHandler(async (req, res, next) => {
  const ownerKey = getOwnerKey(req);
  const { newsId } = req.validated?.query ?? {};

  try {
    const rawResponse = await postGenerationService.probeOpenAIResponse({
      ownerKey,
      newsId,
    });

    return res.status(200).json(rawResponse);
  } catch (error) {
    if (error instanceof postGenerationService.OpenAIResponseError) {
      const status = typeof error.status === 'number' ? error.status : 500;
      return res.status(status).json(error.payloadBruto ?? {});
    }

    if (error instanceof postGenerationService.ArticleNotFoundError) {
      return next(new ApiError({ statusCode: 404, code: 'NEWS_NOT_FOUND', message: 'News item not found' }));
    }

    return next(error);
  }
});

module.exports = {
  triggerGeneration,
  getStatus,
  previewPayload,
  previewOpenAI,
};


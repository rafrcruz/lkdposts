const asyncHandler = require('../utils/async-handler');
const appParamsService = require('../services/app-params.service');

const mapToResponse = (params) => {
  const payload = {
    posts_refresh_cooldown_seconds: params.postsRefreshCooldownSeconds,
    posts_time_window_days: params.postsTimeWindowDays,
    updated_at:
      params.updatedAt instanceof Date ? params.updatedAt.toISOString() : new Date(params.updatedAt).toISOString(),
  };

  if (params.updatedBy) {
    payload.updated_by = params.updatedBy;
  }

  return payload;
};

const get = asyncHandler(async (req, res) => {
  const params = await appParamsService.getAppParams();
  return res.success(mapToResponse(params));
});

const update = asyncHandler(async (req, res) => {
  const updates = req.validated?.body ?? {};
  const updatedBy = req.user?.email ?? (req.user?.id != null ? String(req.user.id) : null);
  const params = await appParamsService.updateAppParams({ updates, updatedBy });
  return res.success(mapToResponse(params));
});

module.exports = {
  get,
  update,
};

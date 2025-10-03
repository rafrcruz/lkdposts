const asyncHandler = require('../../utils/async-handler');
const openAiDiagnosticsService = require('../../services/openai-diagnostics.service');

const runDiagnostics = asyncHandler(async (req, res) => {
  const { model } = req.query ?? {};
  const result = await openAiDiagnosticsService.runDiagnostics({ model });

  return res.success(result);
});

module.exports = {
  runDiagnostics,
};

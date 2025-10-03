const appParamsService = require('../src/services/app-params.service');
const { prisma } = require('../src/lib/prisma');

describe('App parameters service', () => {
  beforeEach(() => {
    prisma.__reset();
  });

  it('ensures default parameters include the OpenAI model set to gpt-5-nano', async () => {
    const params = await appParamsService.ensureDefaultAppParams();

    expect(params.openAiModel).toBe('gpt-5-nano');
  });

  it('getOpenAIModel returns the default when no record exists', async () => {
    const model = await appParamsService.getOpenAIModel();

    expect(model).toBe('gpt-5-nano');
  });

  it('returns sanitized params even when an unsupported model is persisted', async () => {
    await appParamsService.ensureDefaultAppParams();

    await prisma.appParams.update({
      data: { openAiModel: 'gpt-5-ultra' },
    });

    const params = await appParamsService.getAppParams();

    expect(params.openAiModel).toBe(appParamsService.DEFAULT_OPENAI_MODEL);

    const record = await prisma.appParams.findFirst();
    expect(record.openAiModel).toBe('gpt-5-ultra');
  });

  it('exposes the configured model verbatim so runtime fallback can handle invalid values', async () => {
    await appParamsService.ensureDefaultAppParams();

    await prisma.appParams.update({
      data: { openAiModel: 'gpt-5-ultra' },
    });

    const model = await appParamsService.getOpenAIModel();
    expect(model).toBe('gpt-5-ultra');
  });

  it('normalizes persisted invalid models to the default option when requested', async () => {
    await appParamsService.ensureDefaultAppParams();

    await prisma.appParams.update({
      data: { openAiModel: 'gpt-5-ultra' },
    });

    const normalized = await appParamsService.normalizePersistedOpenAiModel();
    expect(normalized).toBe(appParamsService.DEFAULT_OPENAI_MODEL);

    const record = await prisma.appParams.findFirst();
    expect(record.openAiModel).toBe(appParamsService.DEFAULT_OPENAI_MODEL);
  });
});

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
});

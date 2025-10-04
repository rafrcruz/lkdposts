const { extractTextFromResponses } = require('../../src/utils/openai-responses');

describe('extractTextFromResponses', () => {
  it('returns output_text when present', () => {
    const response = {
      output_text: '  Texto direto da resposta.  ',
    };

    expect(extractTextFromResponses(response)).toBe('Texto direto da resposta.');
  });

  it('concatenates textual entries when output_text is missing', () => {
    const response = {
      output: [
        {
          content: [
            { type: 'text', text: 'Primeiro parágrafo.' },
            { type: 'output_text', data: 'Segundo parágrafo.' },
          ],
        },
        {
          content: [
            { type: 'text', text: 'Terceiro parágrafo.' },
          ],
        },
      ],
    };

    expect(extractTextFromResponses(response)).toBe(
      'Primeiro parágrafo.\n\nSegundo parágrafo.\n\nTerceiro parágrafo.',
    );
  });

  it('returns null when no textual content is found', () => {
    const response = {
      output: [
        {
          content: [
            { type: 'json', data: '{"key":"value"}' },
            { type: 'tool_result', content: 'resultado' },
          ],
        },
      ],
    };

    expect(extractTextFromResponses(response)).toBeNull();
  });
});


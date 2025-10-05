const {
  hasBlockTags,
  looksEscapedHtml,
  computeWeakContent,
  buildPreview,
} = require('../../src/utils/html-diagnostics');

describe('html-diagnostics utilities', () => {
  describe('hasBlockTags', () => {
    it('detects known block level tags', () => {
      expect(hasBlockTags('<p>conteúdo</p>')).toBe(true);
      expect(hasBlockTags('<span>inline</span>')).toBe(false);
    });
  });

  describe('looksEscapedHtml', () => {
    it('detects escaped block tags', () => {
      expect(looksEscapedHtml('&lt;div&gt;texto&lt;/div&gt;')).toBe(true);
      expect(looksEscapedHtml('&lt;span&gt;inline&lt;/span&gt;')).toBe(false);
    });
  });

  describe('computeWeakContent', () => {
    it('marks content without block tags as weak even when long', () => {
      const longInline = 'palavra '.repeat(100);

      const result = computeWeakContent({ html: `<span>${longInline}</span>` });

      expect(result).toEqual(
        expect.objectContaining({
          containsBlocks: false,
          weak: true,
        }),
      );
    });

    it('considers content with block tags and enough length as strong', () => {
      const paragraph = `<p>${'conteúdo '.repeat(40)}</p>`;

      const result = computeWeakContent({ html: paragraph });

      expect(result).toEqual(
        expect.objectContaining({
          containsBlocks: true,
          weak: false,
        }),
      );
    });
  });

  describe('buildPreview', () => {
    it('returns original content when shorter than limit', () => {
      expect(buildPreview('resumo', 10)).toBe('resumo');
    });

    it('truncates strings that exceed the maximum length', () => {
      expect(buildPreview('0123456789', 5)).toBe('01234');
    });

    it('returns empty string for invalid input', () => {
      expect(buildPreview(null, 100)).toBe('');
      expect(buildPreview('content', 0)).toBe('');
    });
  });
});

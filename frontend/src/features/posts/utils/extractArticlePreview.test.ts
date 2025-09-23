import { describe, expect, it } from 'vitest';

import { extractArticlePreview } from './extractArticlePreview';

const buildHtml = (content: string) => `<!doctype html><html><body>${content}</body></html>`;

describe('extractArticlePreview', () => {
  it('returns the first valid image url inside a figure', () => {
    const html = buildHtml(`
      <figure>
        <img src="https://example.com/image.jpg" alt="cover" />
      </figure>
      <p>Conteúdo principal da notícia com texto suficiente para formar um resumo adequado.</p>
    `);

    const preview = extractArticlePreview(html);

    expect(preview.imageUrl).toBe('https://example.com/image.jpg');
  });

  it('ignores invalid image urls and resolves relative ones using the base url', () => {
    const html = buildHtml(`
      <p>Introdução sem imagem válida.</p>
      <img src="/images/cover.png" alt="Cover" />
    `);

    const preview = extractArticlePreview(html, 'https://example.com/news/article');

    expect(preview.imageUrl).toBe('https://example.com/images/cover.png');
  });

  it('omits the image when none is available', () => {
    const html = buildHtml('<p>Texto da notícia sem imagens embutidas.</p>');

    const preview = extractArticlePreview(html);

    expect(preview.imageUrl).toBeUndefined();
  });

  it('strips footer sections such as fonte and tags from the excerpt', () => {
    const html = buildHtml(`
      <p>Primeiro parágrafo importante da notícia.</p>
      <div class="fonte">Fonte: Agência X</div>
      <div class="tags">Tags: tecnologia</div>
    `);

    const preview = extractArticlePreview(html);

    expect(preview.excerpt).toContain('Primeiro parágrafo importante da notícia.');
    expect(preview.excerpt).not.toContain('Fonte');
    expect(preview.excerpt).not.toContain('Tags');
  });

  it('produces an excerpt within the expected length range without raw html tags', () => {
    const text = Array.from({ length: 80 })
      .map(() => 'conteúdo')
      .join(' ');

    const html = buildHtml(`<article><p>${text}</p></article>`);

    const preview = extractArticlePreview(html);

    expect(preview.excerpt.length).toBeGreaterThanOrEqual(160);
    expect(preview.excerpt.length).toBeLessThanOrEqual(241);
    expect(preview.excerpt).not.toContain('<');
    expect(preview.excerpt).toMatch(/conteúdo/);
  });

  it('returns the first significant paragraph separately', () => {
    const html = buildHtml(`
      <p></p>
      <p>Primeiro parágrafo significativo.</p>
      <p>Segundo parágrafo.</p>
    `);

    const preview = extractArticlePreview(html);

    expect(preview.firstParagraph).toBe('Primeiro parágrafo significativo.');
  });
});


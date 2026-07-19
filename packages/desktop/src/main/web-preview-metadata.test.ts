import { describe, expect, mock, test } from 'bun:test';
import {
  fetchWebPreviewMetadata,
  parseOpenGraphHtml,
  type WebPreviewDeps,
} from './web-preview-metadata.ts';

describe('web preview metadata', () => {
  test('parses OpenGraph content and resolves relative assets', () => {
    const parsed = parseOpenGraphHtml(
      `<!doctype html><html><head>
        <meta property="og:title" content="Research &amp; Safety">
        <meta property="og:description" content="A concise description.">
        <meta property="og:site_name" content="OpenAI">
        <meta property="og:image" content="/assets/preview.png">
        <link rel="shortcut icon" href="/favicon.png">
      </head></html>`,
      new URL('https://openai.example/research/'),
    );
    expect(parsed).toEqual({
      title: 'Research & Safety',
      description: 'A concise description.',
      siteName: 'OpenAI',
      imageUrl: 'https://openai.example/assets/preview.png',
      faviconUrl: 'https://openai.example/favicon.png',
    });
  });

  test('returns bounded thumbnail and favicon data URLs', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://preview.example/article') {
        return new Response(
          '<head><meta property="og:title" content="Preview title"><meta property="og:image" content="https://cdn.example/preview.png"><link rel="icon" href="/icon.png"></head>',
          { headers: { 'content-type': 'text/html' } },
        );
      }
      if (url === 'https://cdn.example/preview.png') {
        return new Response(new Uint8Array([1, 2]), {
          headers: { 'content-type': 'image/png' },
        });
      }
      if (url === 'https://preview.example/icon.png') {
        return new Response(new Uint8Array([3, 4]), {
          headers: { 'content-type': 'image/png' },
        });
      }
      return new Response(null, { status: 404 });
    });
    const deps: WebPreviewDeps = {
      fetch: fetchMock as unknown as typeof fetch,
      lookup: async () => [{ address: '93.184.216.34' }],
    };

    await expect(fetchWebPreviewMetadata('https://preview.example/article', deps)).resolves.toEqual(
      {
        url: 'https://preview.example/article',
        title: 'Preview title',
        imageDataUrl: 'data:image/png;base64,AQI=',
        faviconDataUrl: 'data:image/png;base64,AwQ=',
      },
    );
  });

  test('refuses destinations that resolve to private addresses', async () => {
    const fetchMock = mock(async () => new Response('<head></head>'));
    const deps: WebPreviewDeps = {
      fetch: fetchMock as unknown as typeof fetch,
      lookup: async () => [{ address: '127.0.0.1' }],
    };

    await expect(
      fetchWebPreviewMetadata('https://private-preview.example/', deps),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

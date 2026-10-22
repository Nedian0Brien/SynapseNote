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
        // Reported alongside the inlined bytes for consumers that persist a
        // preview into a document (`<Bookmark>`), where base64 payloads
        // would bloat the file. Emitted only because the inline fetch above
        // succeeded — that fetch is the validation pass.
        imageUrl: 'https://cdn.example/preview.png',
        faviconDataUrl: 'data:image/png;base64,AwQ=',
        faviconUrl: 'https://preview.example/icon.png',
      },
    );
  });

  test('uses YouTube oEmbed instead of downloading the watch page', async () => {
    const oEmbedUrl =
      'https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dk_gaZjXD5OY';
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === oEmbedUrl) {
        return Response.json({
          title: 'This Could End the RAM Crisis',
          provider_name: 'YouTube',
          thumbnail_url: 'https://i.ytimg.com/vi/k_gaZjXD5OY/hqdefault.jpg',
        });
      }
      if (url === 'https://i.ytimg.com/vi/k_gaZjXD5OY/hqdefault.jpg') {
        return new Response(new Uint8Array([1, 2]), {
          headers: { 'content-type': 'image/jpeg' },
        });
      }
      if (url === 'https://www.youtube.com/favicon.ico') {
        return new Response(new Uint8Array([3, 4]), {
          headers: { 'content-type': 'image/x-icon' },
        });
      }
      throw new Error(`unexpected watch-page request: ${url}`);
    });
    const deps: WebPreviewDeps = {
      fetch: fetchMock as unknown as typeof fetch,
      lookup: async () => [{ address: '142.250.207.46' }],
    };

    await expect(fetchWebPreviewMetadata('https://youtu.be/k_gaZjXD5OY', deps)).resolves.toEqual({
      url: 'https://www.youtube.com/watch?v=k_gaZjXD5OY',
      title: 'This Could End the RAM Crisis',
      siteName: 'YouTube',
      imageDataUrl: 'data:image/jpeg;base64,AQI=',
      imageUrl: 'https://i.ytimg.com/vi/k_gaZjXD5OY/hqdefault.jpg',
      faviconDataUrl: 'data:image/x-icon;base64,AwQ=',
      faviconUrl: 'https://www.youtube.com/favicon.ico',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('keeps generic HTML responses bounded', async () => {
    const fetchMock = mock(
      async () =>
        new Response(`<head><title>Too large</title></head>${'x'.repeat(512 * 1024)}`, {
          headers: { 'content-type': 'text/html' },
        }),
    );
    const deps: WebPreviewDeps = {
      fetch: fetchMock as unknown as typeof fetch,
      lookup: async () => [{ address: '93.184.216.34' }],
    };

    await expect(
      fetchWebPreviewMetadata('https://oversized-preview.example/article', deps),
    ).resolves.toBeNull();
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

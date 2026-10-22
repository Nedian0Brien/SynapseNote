import { describe, expect, mock, test } from 'bun:test';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { chatFilePathFromHref, dispatchChatFileLinkClick } from './chat-file-links';

function makeBridge() {
  const openAsset = mock(async (_path: string) => ({ ok: true }) as const);
  const revealAsset = mock(async (_path: string) => ({ ok: true }) as const);
  const revealExternal = mock(
    async (_path: string) => ({ ok: true, outcome: 'revealed' }) as const,
  );
  const bridge = {
    config: { projectPath: '/Users/me/project' },
    shell: { openAsset, revealAsset, revealExternal },
  } as unknown as OkDesktopBridge;
  return { bridge, openAsset, revealAsset, revealExternal };
}

describe('chatFilePathFromHref', () => {
  test('accepts Codex absolute file links and strips source locations', () => {
    expect(chatFilePathFromHref('/Users/me/project/packages/app/src/main.tsx:42:7')).toBe(
      '/Users/me/project/packages/app/src/main.tsx',
    );
  });

  test('decodes file URLs but leaves web URLs to normal link handling', () => {
    expect(chatFilePathFromHref('file:///Users/me/project/My%20Note.md:12')).toBe(
      '/Users/me/project/My Note.md',
    );
    expect(chatFilePathFromHref('https://example.com/file.ts')).toBeNull();
    expect(chatFilePathFromHref('mailto:hello@example.com')).toBeNull();
  });
});

describe('dispatchChatFileLinkClick', () => {
  test('prevents native navigation and opens an in-project source file', async () => {
    const { bridge, openAsset } = makeBridge();
    const preventDefault = mock(() => {});

    expect(
      dispatchChatFileLinkClick(
        { preventDefault },
        '/Users/me/project/packages/app/src/main.tsx:42',
        bridge,
      ),
    ).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(openAsset).toHaveBeenCalledWith('packages/app/src/main.tsx');
  });

  test('opens markdown documents inside SynapseNote', () => {
    const { bridge, openAsset } = makeBridge();
    const navigateToHash = mock((_hash: string) => {});

    expect(
      dispatchChatFileLinkClick({ preventDefault: () => {} }, './notes/Research.md:9', bridge, {
        navigateToHash,
      }),
    ).toBe(true);
    expect(navigateToHash).toHaveBeenCalledWith('#/notes/Research');
    expect(openAsset).not.toHaveBeenCalled();
  });

  test('does not claim ordinary web links', () => {
    const { bridge } = makeBridge();
    const preventDefault = mock(() => {});
    expect(dispatchChatFileLinkClick({ preventDefault }, 'https://example.com/docs', bridge)).toBe(
      false,
    );
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

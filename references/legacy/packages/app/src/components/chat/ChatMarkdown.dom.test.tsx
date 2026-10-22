import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { ChatMarkdown } from './ChatMarkdown';

afterEach(cleanup);

describe('ChatMarkdown local file links', () => {
  test('a Codex absolute-path link is claimed before browser navigation', async () => {
    const openAsset = mock(async (_path: string) => ({ ok: true }) as const);
    const bridge = {
      config: { projectPath: '/Users/me/project' },
      shell: { openAsset },
    } as unknown as OkDesktopBridge;

    render(
      <ChatMarkdown
        text="[main.tsx](/Users/me/project/packages/app/src/main.tsx:42)"
        bridge={bridge}
      />,
    );

    const click = fireEvent.click(screen.getByRole('link', { name: 'main.tsx' }));
    expect(click).toBe(false);
    await Promise.resolve();
    expect(openAsset).toHaveBeenCalledWith('packages/app/src/main.tsx');
  });

  test('renders model-style display math with KaTeX', async () => {
    const bridge = {} as OkDesktopBridge;
    render(
      <ChatMarkdown
        text="[ \\mathrm{nDCG@k}=\\frac{\\mathrm{DCG@k}}{\\mathrm{IDCG@k}} ]"
        bridge={bridge}
      />,
    );

    const math = await waitFor(() => {
      const element = document.querySelector<HTMLElement>('[data-chat-math="display"]');
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });
    expect(math.getAttribute('data-chat-math')).toBe('display');
    expect(math.querySelector('.katex-display')).not.toBeNull();
    expect(math.closest('pre')).toBeNull();
    expect(math.textContent).toContain('nDCG@k');
  });
});

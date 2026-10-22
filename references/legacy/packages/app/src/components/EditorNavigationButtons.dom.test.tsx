import { describe, expect, mock, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { expectVisualClassTokens } from '@/test-utils/visual-contract';

const goBack = mock(() => {});
const goForward = mock(() => {});

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((acc, part, index) => `${acc}${part}${values[index] ?? ''}`, ''),
  }),
}));

mock.module('@/hooks/use-navigation-history', () => ({
  useNavigationHistory: () => ({
    canGoBack: true,
    canGoForward: false,
    goBack,
    goForward,
  }),
}));

async function renderButtons(isElectronHost = false) {
  const { EditorNavigationButtons } = await import('./EditorNavigationButtons');
  render(
    <TooltipProvider>
      <EditorNavigationButtons isElectronHost={isElectronHost} />
    </TooltipProvider>,
  );
}

describe('EditorNavigationButtons', () => {
  test('reflects history availability and invokes the available direction', async () => {
    await renderButtons();

    const back = screen.getByRole('button', { name: 'Back' });
    const forward = screen.getByRole('button', { name: 'Forward' });
    expect((back as HTMLButtonElement).disabled).toBe(false);
    expect((forward as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(back);
    fireEvent.click(forward);
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(goForward).not.toHaveBeenCalled();
  });

  test('opts the button group out of the Electron drag region', async () => {
    await renderButtons(true);

    expectVisualClassTokens(screen.getByTestId('editor-navigation-buttons').className, [
      '[-webkit-app-region:no-drag]',
    ]);
  });
});

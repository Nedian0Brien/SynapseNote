import { afterEach, describe, expect, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { replaceHashWithoutNavigation } from '@/lib/doc-hash';
import { resetNavigationHistoryForTesting, useNavigationHistory } from './use-navigation-history';

const originalDesktopBridge = window.okDesktop;

function HistoryHarness() {
  const { canGoBack, canGoForward, goBack, goForward } = useNavigationHistory();
  return (
    <>
      <button type="button" disabled={!canGoBack} onClick={goBack}>
        Back
      </button>
      <button type="button" disabled={!canGoForward} onClick={goForward}>
        Forward
      </button>
    </>
  );
}

function replaceAndDispatchHash(hash: string): void {
  const { pathname, search } = window.location;
  window.history.replaceState(null, '', `${pathname}${search}${hash}`);
  window.dispatchEvent(new Event('hashchange'));
}

describe('useNavigationHistory', () => {
  afterEach(() => {
    cleanup();
    resetNavigationHistoryForTesting();
    window.history.replaceState(null, '', window.location.pathname);
    window.okDesktop = originalDesktopBridge;
  });

  test('moves backward and forward through app content routes', () => {
    replaceAndDispatchHash('#/alpha');
    render(<HistoryHarness />);

    act(() => replaceAndDispatchHash('#/beta'));
    act(() => replaceAndDispatchHash('#/__asset__/diagram.png'));

    const back = screen.getByRole('button', { name: 'Back' });
    const forward = screen.getByRole('button', { name: 'Forward' });
    expect((back as HTMLButtonElement).disabled).toBe(false);
    expect((forward as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(back);
    expect(window.location.hash).toBe('#/beta');
    expect((forward as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(forward);
    expect(window.location.hash).toBe('#/__asset__/diagram.png');
    expect((forward as HTMLButtonElement).disabled).toBe(true);
  });

  test('ignores auxiliary hashes and same-document anchors', () => {
    replaceAndDispatchHash('#/alpha');
    render(<HistoryHarness />);

    act(() => replaceAndDispatchHash('#/beta'));
    act(() => replaceAndDispatchHash('#/beta#details'));
    act(() => replaceAndDispatchHash('#settings'));

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(window.location.hash).toBe('#/alpha');
  });

  test('records file-tree style replaceState navigation', () => {
    replaceAndDispatchHash('#/alpha');
    render(<HistoryHarness />);

    act(() => replaceHashWithoutNavigation('#/folder/'));

    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(window.location.hash).toBe('#/alpha');
  });

  test('routes mouse back and forward buttons through app navigation history', () => {
    replaceAndDispatchHash('#/alpha');
    render(<HistoryHarness />);

    act(() => replaceAndDispatchHash('#/beta'));
    act(() => replaceAndDispatchHash('#/gamma'));

    const backDown = new MouseEvent('mousedown', { button: 3, cancelable: true });
    const backUp = new MouseEvent('mouseup', { button: 3, cancelable: true });
    act(() => {
      window.dispatchEvent(backDown);
      window.dispatchEvent(backUp);
    });

    expect(backDown.defaultPrevented).toBe(true);
    expect(backUp.defaultPrevented).toBe(true);
    expect(window.location.hash).toBe('#/beta');

    const forwardDown = new MouseEvent('mousedown', { button: 4, cancelable: true });
    const forwardUp = new MouseEvent('mouseup', { button: 4, cancelable: true });
    act(() => {
      window.dispatchEvent(forwardDown);
      window.dispatchEvent(forwardUp);
    });

    expect(forwardDown.defaultPrevented).toBe(true);
    expect(forwardUp.defaultPrevented).toBe(true);
    expect(window.location.hash).toBe('#/gamma');
  });

  test('routes Electron browser commands through app navigation history', () => {
    let onMenuAction: ((action: string) => void) | null = null;
    window.okDesktop = {
      onMenuAction(cb: (action: string) => void) {
        onMenuAction = cb;
        return () => {
          onMenuAction = null;
        };
      },
    } as unknown as NonNullable<typeof window.okDesktop>;

    replaceAndDispatchHash('#/alpha');
    render(<HistoryHarness />);
    act(() => replaceAndDispatchHash('#/beta'));
    act(() => replaceAndDispatchHash('#/gamma'));

    act(() => onMenuAction?.('navigate-back'));
    expect(window.location.hash).toBe('#/beta');

    act(() => onMenuAction?.('navigate-forward'));
    expect(window.location.hash).toBe('#/gamma');
  });
});

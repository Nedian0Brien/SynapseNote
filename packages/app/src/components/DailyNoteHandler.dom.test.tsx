import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';

const addPage = mock((_docName: string) => {});
const toastSuccess = mock((_message: string, _options?: unknown) => {});
const toastError = mock((_message: string, _options?: unknown) => {});
let dailyAction = mock(() => Promise.resolve({ docName: 'daily/2026-08-21', created: true }));

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

mock.module('@/components/PageListContext', () => ({
  usePageList: () => ({ addPage }),
}));

mock.module('@/lib/daily-note', () => ({
  openOrCreateDailyNote: () => dailyAction(),
}));

mock.module('sonner', () => ({
  toast: { success: toastSuccess, error: toastError },
}));

describe('DailyNoteHandler', () => {
  beforeEach(() => {
    cleanup();
    addPage.mockClear();
    toastSuccess.mockClear();
    toastError.mockClear();
    dailyAction = mock(() => Promise.resolve({ docName: 'daily/2026-08-21', created: true }));
    window.location.hash = '';
  });

  afterEach(() => cleanup());

  test('reconciles a newly created note and navigates to it', async () => {
    const { DailyNoteHandler } = await import('./DailyNoteHandler');
    const { emitOpenTodayDailyNote } = await import('@/lib/daily-note-events');
    const { subscribeToDocumentsChanged } = await import('@/lib/documents-events');
    const changed = mock((_channels: unknown) => {});
    const unsubscribe = subscribeToDocumentsChanged(changed);
    render(<DailyNoteHandler />);

    act(() => emitOpenTodayDailyNote());

    await waitFor(() => expect(addPage).toHaveBeenCalledWith('daily/2026-08-21'));
    expect(changed).toHaveBeenCalledWith(['files', 'backlinks', 'graph']);
    expect(toastSuccess).toHaveBeenCalledWith('Daily note created', {
      description: 'daily/2026-08-21',
    });
    expect(window.location.hash).toBe('#/daily/2026-08-21');
    unsubscribe();
  });

  test('opens an existing note without announcing a creation', async () => {
    dailyAction = mock(() => Promise.resolve({ docName: 'daily/2026-08-21', created: false }));
    const { DailyNoteHandler } = await import('./DailyNoteHandler');
    const { emitOpenTodayDailyNote } = await import('@/lib/daily-note-events');
    const { subscribeToDocumentsChanged } = await import('@/lib/documents-events');
    const changed = mock((_channels: unknown) => {});
    const unsubscribe = subscribeToDocumentsChanged(changed);
    render(<DailyNoteHandler />);

    act(() => emitOpenTodayDailyNote());

    await waitFor(() => expect(window.location.hash).toBe('#/daily/2026-08-21'));
    expect(addPage).toHaveBeenCalledWith('daily/2026-08-21');
    expect(changed).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    unsubscribe();
  });

  test('coalesces repeated entry-point events while creation is in flight', async () => {
    let resolveAction: ((value: { docName: string; created: boolean }) => void) | undefined;
    dailyAction = mock(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    const { DailyNoteHandler } = await import('./DailyNoteHandler');
    const { emitOpenTodayDailyNote } = await import('@/lib/daily-note-events');
    render(<DailyNoteHandler />);

    act(() => {
      emitOpenTodayDailyNote();
      emitOpenTodayDailyNote();
    });
    expect(dailyAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAction?.({ docName: 'daily/2026-08-21', created: false });
    });
  });
});

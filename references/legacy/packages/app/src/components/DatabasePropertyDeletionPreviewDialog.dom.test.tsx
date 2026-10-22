import { afterEach, describe, expect, mock, test } from 'bun:test';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import type { DatabaseProperty } from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DatabasePropertyDeletionPreview } from '@/lib/database-property-deletion';
import { DatabasePropertyDeletionPreviewDialog } from './DatabasePropertyDeletionPreviewDialog';

i18n.load('en', {});
i18n.activate('en');

afterEach(() => cleanup());

describe('DatabasePropertyDeletionPreviewDialog', () => {
  test('explains impact, dependencies, and recovery before confirming', () => {
    const onConfirm = mock(() => {});
    const onOpenChange = mock(() => {});
    const preview = {
      property: {
        id: 'prop_budget',
        key: 'budget',
        name: 'Budget',
        type: 'number',
      } as DatabaseProperty,
      records: [],
      recordCount: 4,
      valueCount: 3,
      dependencies: [
        {
          id: 'prop_total',
          name: 'Total',
          kind: 'property' as const,
          reason: 'Formula reads this property',
        },
        {
          id: 'view_budget',
          name: 'Budget view',
          kind: 'view' as const,
          reason: 'View configuration references this property',
        },
      ],
    } satisfies DatabasePropertyDeletionPreview;

    render(
      <I18nProvider i18n={i18n}>
        <DatabasePropertyDeletionPreviewDialog
          open
          preview={preview}
          onOpenChange={onOpenChange}
          onConfirm={onConfirm}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole('dialog', { name: 'Review property deletion' })).toBeTruthy();
    expect(screen.getByText('Budget')).toBeTruthy();
    expect(screen.getByText('Number')).toBeTruthy();
    expect(screen.getByText('Values to clear')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Records checked')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('Budget view')).toBeTruthy();
    expect(screen.getByText(/History exposes Undo/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DatabaseView } from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabaseViewRenameDialog } from './DatabaseViewRenameDialog';

const view: DatabaseView = {
  id: 'view_active',
  key: 'active',
  name: 'Active',
  sourceId: 'ds_tasks',
  layout: { type: 'table', configuration: {} },
  sort: [],
  groups: [],
  projection: { propertyIds: ['prop_title'], body: 'hidden' },
};

afterEach(cleanup);

describe('DatabaseViewRenameDialog', () => {
  test('keeps the stable identity and sends only the reviewed display name', () => {
    const onReview = mock(() => {});
    render(
      <DatabaseViewRenameDialog
        open
        onOpenChange={() => {}}
        view={view}
        busy={false}
        onReview={onReview}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Saved view name' }), {
      target: { value: 'In progress' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review rename' }));
    expect(onReview).toHaveBeenCalledWith('In progress');
    expect(view.id).toBe('view_active');
  });
});

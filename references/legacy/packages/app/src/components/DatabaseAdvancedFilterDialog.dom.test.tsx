import { afterEach, describe, expect, mock, test } from 'bun:test';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabaseAdvancedFilterDialog } from './DatabaseAdvancedFilterDialog';

i18n.load('en', {});
i18n.activate('en');

afterEach(cleanup);

const source = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' as const },
    { id: 'prop_score', key: 'score', name: 'Score', type: 'number' as const },
    { id: 'prop_done', key: 'done', name: 'Done', type: 'checkbox' as const },
  ],
};

describe('DatabaseAdvancedFilterDialog', () => {
  test('renders nested AND/OR/NOT groups and clears only through explicit review', () => {
    const onSave = mock(() => {});
    render(
      <I18nProvider i18n={i18n}>
        <DatabaseAdvancedFilterDialog
          open
          onOpenChange={() => {}}
          source={source}
          initialWhere={{
            and: [
              { propertyId: 'prop_score', operator: 'gte', value: 10 },
              {
                or: [
                  { propertyId: 'prop_title', operator: 'contains', value: 'urgent' },
                  { not: { propertyId: 'prop_done', operator: 'eq', value: true } },
                ],
              },
            ],
          }}
          onSave={onSave}
        />
      </I18nProvider>,
    );
    expect(document.querySelectorAll('[data-filter-node="and"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-filter-node="or"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-filter-node="not"]')).toHaveLength(1);
    expect(screen.getByDisplayValue('10')).toBeTruthy();
    expect(screen.getByDisplayValue('urgent')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved filters' }));
    expect(onSave).toHaveBeenCalledWith(undefined);
  });

  test('starts a header-targeted filter rule on the requested property', () => {
    render(
      <I18nProvider i18n={i18n}>
        <DatabaseAdvancedFilterDialog
          open
          onOpenChange={() => {}}
          source={source}
          initialPropertyId="prop_done"
          onSave={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole('combobox', { name: 'Filter property' }).textContent).toContain('Done');
  });
});

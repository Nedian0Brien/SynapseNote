import { afterEach, describe, expect, mock, test } from 'bun:test';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import type { DatabaseDefinition, DatabaseProperty } from '@nedian0brien/synapsenote-core';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabaseButtonPropertyDialog } from './DatabaseButtonPropertyDialog';

i18n.load('en', {});
i18n.activate('en');

afterEach(cleanup);

const definition: DatabaseDefinition = DatabaseDefinitionSchema.parse({
  version: 1,
  id: 'db_button_dialog',
  key: 'button_dialog',
  name: 'Button dialog',
  contract: {
    purpose: 'Exercise the Button action editor',
    canonicality: 'canonical',
    vocabulary: ['button'],
    freshness: { expectation: 'realtime' },
    sensitivity: 'internal',
  },
  sources: [
    {
      id: 'ds_tasks',
      key: 'tasks',
      name: 'Tasks',
      recordMeaning: 'One task',
      folder: 'tasks',
      properties: [
        { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
        { id: 'prop_done', key: 'done', name: 'Done', type: 'checkbox' },
        {
          id: 'prop_run',
          key: 'run',
          name: 'Run',
          type: 'button',
          label: 'Run',
          actions: [
            {
              id: 'step_1',
              kind: 'create_record',
              sourceId: 'ds_tasks',
              values: { prop_title: 'New record' },
              body: '',
            },
          ],
        },
      ],
    },
  ],
});

const source = definition.sources[0];
if (!source) throw new Error('fixture source missing');
const button = source.properties.find(
  (property): property is Extract<DatabaseProperty, { type: 'button' }> =>
    property.type === 'button',
);
if (!button) throw new Error('fixture button missing');

function renderDialog(
  onSave: (property: Extract<DatabaseProperty, { type: 'button' }>) => void,
  property: Extract<DatabaseProperty, { type: 'button' }> = button,
) {
  return render(
    <I18nProvider i18n={i18n}>
      <DatabaseButtonPropertyDialog
        open
        onOpenChange={() => {}}
        database={definition}
        source={source}
        property={property}
        onSave={onSave}
      />
    </I18nProvider>,
  );
}

describe('DatabaseButtonPropertyDialog', () => {
  test('edits the label of the seeded create step and hands back the whole property', () => {
    const onSave = mock(() => {});
    renderDialog(onSave);

    expect((screen.getByLabelText('Title value') as HTMLInputElement).value).toBe('New record');
    // Title is required, so the row that satisfies it cannot be dropped — the
    // manifest would refuse the create step the moment it were.
    expect((screen.getByLabelText('Remove Title value') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Button label'), { target: { value: 'Add task' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));

    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      id: 'prop_run',
      label: 'Add task',
      actions: [
        {
          id: 'step_1',
          kind: 'create_record',
          sourceId: 'ds_tasks',
          values: { prop_title: 'New record' },
        },
      ],
    });
  });

  /**
   * Switching kinds must rebuild the action, not merge into it: `create_record`
   * and `update_record` share only `id`, and a leftover `sourceId` would fail
   * the strict manifest schema at commit with nothing on screen to point at.
   */
  test('replaces the action when the step changes kind', async () => {
    const onSave = mock(() => {});
    renderDialog(onSave);

    fireEvent.click(screen.getByRole('combobox', { name: 'Step 1 action' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Edit this record' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));

    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      actions: [{ id: 'step_1', kind: 'update_record', operations: [{ op: 'append', value: '' }] }],
    });
  });

  test('adds a second step and keeps its id distinct', async () => {
    const onSave = mock(() => {});
    renderDialog(onSave);

    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));

    const saved = onSave.mock.calls[0]?.[0] as
      | { actions: readonly { id: string; kind: string }[] }
      | undefined;
    expect(saved?.actions.map((action) => action.id)).toEqual(['step_1', 'step_2']);
    expect(saved?.actions[1]?.kind).toBe('update_record');
  });

  /**
   * The dialog validates by parsing the candidate definition, so the message
   * shown is the manifest's own — the same one the server would return.
   */
  test('blocks a save the manifest would refuse and shows why', () => {
    const onSave = mock(() => {});
    // A Button that reached the app already broken — hand-authored, or written
    // before a property it depends on was removed.
    renderDialog(onSave, {
      ...button,
      actions: [
        { id: 'step_1', kind: 'create_record', sourceId: 'ds_tasks', values: {}, body: '' },
      ],
    });

    expect(screen.getByRole('alert').textContent).toContain('missing required property');
    expect(
      (screen.getByRole('button', { name: 'Review change' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  test('refuses an empty label without waiting for the server', () => {
    const onSave = mock(() => {});
    renderDialog(onSave);

    fireEvent.change(screen.getByLabelText('Button label'), { target: { value: '  ' } });
    expect(
      (screen.getByRole('button', { name: 'Review change' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

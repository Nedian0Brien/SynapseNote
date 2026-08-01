import { describe, expect, test } from 'bun:test';
import type { DatabaseSource, DatabaseView } from '@nedian0brien/synapsenote-core';
import {
  compileSavedViewDesiredState,
  createSavedViewSettingsDraft,
  reconcileSavedViewProjectionDraft,
} from './database-saved-view-settings-draft';

const source: DatabaseSource = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
    { id: 'prop_status', key: 'status', name: 'Status', type: 'text' },
  ],
};

const view: DatabaseView = {
  id: 'view_tasks',
  key: 'tasks',
  name: 'Tasks',
  sourceId: source.id,
  layout: {
    type: 'table',
    configuration: { wrap: false, rowHeight: 'standard', propertyWidths: { prop_title: 280 } },
  },
  sort: [{ propertyId: 'prop_score', direction: 'desc' }],
  groups: [],
  projection: { propertyIds: ['prop_title', 'prop_score'], body: 'preview' },
};

describe('saved view settings draft', () => {
  test('reconciles a reopened projection with source additions while retaining the title first', () => {
    expect(reconcileSavedViewProjectionDraft(view, source)).toEqual({
      propertyOrder: ['prop_title', 'prop_score', 'prop_status'],
      visiblePropertyIds: ['prop_title', 'prop_score'],
    });
  });

  test('compiles editor-only identifiers out of the reviewed desired state', () => {
    const draft = createSavedViewSettingsDraft(view, source, 'prop_status');

    expect(compileSavedViewDesiredState(view, draft)).toMatchObject({
      sort: [
        { propertyId: 'prop_score', direction: 'desc' },
        { propertyId: 'prop_status', direction: 'asc' },
      ],
      projection: { propertyIds: ['prop_title', 'prop_score'], body: 'preview' },
      layout: view.layout,
    });
    expect(compileSavedViewDesiredState(view, draft).sort).not.toContainEqual(
      expect.objectContaining({ editorId: expect.any(String) }),
    );
  });

  test('rejects a desired state without a visible property', () => {
    const draft = createSavedViewSettingsDraft(view, source);
    draft.visiblePropertyIds = [];

    expect(() => compileSavedViewDesiredState(view, draft)).toThrow(
      'A saved view must show at least one property',
    );
  });
});

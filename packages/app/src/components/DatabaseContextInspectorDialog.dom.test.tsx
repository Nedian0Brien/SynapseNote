import { afterEach, describe, expect, test } from 'bun:test';
import type { DatabaseContextInspection } from '@nedian0brien/synapsenote-server';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatabaseContextInspectorBody } from './DatabaseContextInspectorDialog';

const originalClipboard = navigator.clipboard;

afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: originalClipboard,
  });
});

function inspection(): DatabaseContextInspection {
  return {
    packId: 'pack_123456789012345678901234',
    capturedAt: '2026-07-19T12:00:00.000Z',
    goal: 'Prepare a grounded support brief',
    database: { id: 'db_feedback', name: 'Feedback' },
    sourceId: 'ds_feedback',
    agentView: { id: 'view_support', revision: `sha256:${'a'.repeat(64)}` },
    disclosure: 'records',
    returned: 1,
    tokenCount: {
      tokenizer: 'utf8_bytes_div3',
      estimated: 720,
      available: 1_800,
      max: 2_000,
      reserve: 200,
    },
    redactions: {
      evaluated: true,
      rootRecords: 0,
      rootProperties: 0,
      relationRecords: 0,
      relationProperties: 0,
    },
    freshness: {
      manifestRevision: 'sha256:manifest',
      schemaRevision: 'sha256:schema',
      indexRevision: 'sha256:index',
      indexState: 'idle',
      indexFreshness: 'snapshot',
      expectation: { expectation: 'realtime', maxAgeSeconds: 60 },
    },
    omissions: {
      records: 0,
      propertyIds: [],
      evidence: 0,
      fullBodies: 0,
      relation: {
        depthLimit: 0,
        recordLimit: 0,
        fanOutLimit: 0,
        missingRecords: 0,
        permissionRecords: 0,
        permissionProperties: 0,
        cycles: 0,
        deduplicatedRecords: 0,
      },
    },
    truncation: { truncated: false, cause: null, continuationAvailable: false },
    exactPack: {
      id: 'pack_123456789012345678901234',
      goal: 'Prepare a grounded support brief',
      schema: {
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title', required: true },
          {
            id: 'prop_private',
            key: 'private',
            name: 'Private note',
            type: 'text',
            required: false,
          },
        ],
      },
      records: [
        {
          id: 'rec_visible',
          values: { prop_title: 'Visible evidence', prop_private: 'Do not disclose' },
        },
      ],
    } as unknown as DatabaseContextInspection['exactPack'],
  };
}

describe('DatabaseContextInspectorDialog field controls', () => {
  test('updates the local selected-field preview without changing the exact pack', async () => {
    const selected = inspection();
    const user = userEvent.setup();
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          copied = value;
        },
      },
    });
    render(
      <DatabaseContextInspectorBody
        inspections={[selected]}
        selected={selected}
        status="success"
        error={null}
        onSelect={() => {}}
        onRetry={() => {}}
      />,
    );

    const preview = screen.getByTestId('database-context-selected-preview');
    expect(preview.textContent).toContain('Do not disclose');
    expect(screen.getByText('2 of 2 fields selected')).toBeTruthy();

    await user.click(screen.getByRole('checkbox', { name: 'Include Private note' }));

    expect(preview.textContent).toContain('Visible evidence');
    expect(preview.textContent).not.toContain('Do not disclose');
    expect(screen.getByText('1 of 2 fields selected')).toBeTruthy();
    expect(selected.exactPack.records).toEqual([
      {
        id: 'rec_visible',
        values: { prop_title: 'Visible evidence', prop_private: 'Do not disclose' },
      },
    ]);

    await user.click(screen.getByRole('button', { name: 'None' }));
    expect(preview.textContent).not.toContain('Visible evidence');
    expect(screen.getByText('0 of 2 fields selected')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Copy selected context' }));
    expect(copied).toContain('"properties": []');
    expect(screen.getByRole('button', { name: 'Copy selected context' }).textContent).toContain(
      'Copied',
    );
  });
});

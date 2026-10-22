import { describe, expect, test } from 'bun:test';
import { SYSTEM_DOC_NAME } from '@nedian0brien/synapsenote-core';
import { getCurrentDocumentSnapshot } from './api-extension.ts';

function hocuspocusWithStates(states: Map<number, unknown>) {
  return {
    documents: new Map([
      [
        SYSTEM_DOC_NAME,
        {
          awareness: {
            getStates: () => states,
          },
        },
      ],
    ]),
  } as never;
}

describe('getCurrentDocumentSnapshot', () => {
  test('returns an empty result without a connected system document', () => {
    expect(getCurrentDocumentSnapshot({ documents: new Map() } as never)).toEqual({
      current: null,
      viewers: [],
    });
  });

  test('prefers the focused visible window over a newer background window', () => {
    const result = getCurrentDocumentSnapshot(
      hocuspocusWithStates(
        new Map([
          [
            10,
            {
              currentView: {
                document: 'notes/background',
                focused: false,
                visible: true,
                updatedAt: 200,
              },
            },
          ],
          [
            20,
            {
              currentView: {
                document: 'notes/focused',
                focused: true,
                visible: true,
                updatedAt: 100,
              },
            },
          ],
        ]),
      ),
    );

    expect(result.current).toEqual({
      clientId: 20,
      document: 'notes/focused',
      focused: true,
      visible: true,
      updatedAt: 100,
    });
    expect(result.viewers.map((viewer) => viewer.clientId)).toEqual([20, 10]);
  });

  test('reports a focused non-document view honestly and ignores invalid payloads', () => {
    const result = getCurrentDocumentSnapshot(
      hocuspocusWithStates(
        new Map([
          [
            1,
            {
              currentView: {
                document: null,
                focused: true,
                visible: true,
                updatedAt: 300,
              },
            },
          ],
          [2, { currentView: { document: 42, focused: true } }],
          [3, { agentPresence: {} }],
        ]),
      ),
    );

    expect(result.current?.document).toBeNull();
    expect(result.viewers).toHaveLength(1);
  });
});

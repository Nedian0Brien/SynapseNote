import { describe, expect, test } from 'bun:test';
import { GRAPH_COLLISION_PADDING } from '@/components/graph-folders';
import { getGraphNodeCanvasRadius } from '@/components/graph-view-utils';
import {
  clampGraphSettings,
  GRAPH_FORCE_DEFAULTS,
  GRAPH_SETTINGS_BOUNDS,
  type GraphSettings,
  type GraphSettingsStorage,
  getDefaultGraphSettings,
  MAX_GRAPH_GROUPS,
  readGraphSettings,
  writeGraphSettings,
} from './graph-settings-store';

const DOCKED_KEY = 'ok-graph-settings-docked-v1';
const FULLSCREEN_KEY = 'ok-graph-settings-fullscreen-v1';

function memoryStorage(seed: Record<string, string> = {}): GraphSettingsStorage & {
  values: Record<string, string>;
} {
  const values = { ...seed };
  return {
    values,
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => {
      values[key] = value;
    },
  };
}

describe('getDefaultGraphSettings', () => {
  test('reproduces the hardcoded values the pre-settings build shipped', () => {
    // These are not arbitrary: changing any of them relayouts or re-densifies
    // every existing user's graph on upgrade.
    const docked = getDefaultGraphSettings('docked');
    expect(docked.display.textFadeThreshold).toBe(1.8);
    expect(docked.display.maxLabels).toBe(18);
    expect(docked.filters.showExternalNodes).toBe(false);
    expect(docked.forces).toEqual(GRAPH_FORCE_DEFAULTS);
  });

  test('keeps link distance clear of the collision force’s reach', () => {
    // Collision holds page centres ~34 units apart. d3's default distance of 30
    // sits under that, so every spring is compressed at all times and the graph
    // collapses to a packed disc. This is the one invariant to preserve if the
    // padding or the node radius ever changes.
    const collisionReach = 2 * (getGraphNodeCanvasRadius('default') + GRAPH_COLLISION_PADDING);
    expect(GRAPH_FORCE_DEFAULTS.linkDistance).toBeGreaterThan(collisionReach);
  });

  test('gives the fullscreen scope a tighter label budget than the docked scope', () => {
    expect(getDefaultGraphSettings('fullscreen').display.maxLabels).toBe(10);
    expect(getDefaultGraphSettings('docked').display.maxLabels).toBe(18);
  });

  test('shows folder nodes only on the whole-project view', () => {
    // The docked graph is a 2-hop neighborhood: there is no blob to break into
    // places, so a folder node is one more thing crowding a small canvas.
    expect(getDefaultGraphSettings('fullscreen').filters.showFolderNodes).toBe(true);
    expect(getDefaultGraphSettings('docked').filters.showFolderNodes).toBe(false);
  });

  test('returns a fresh forces object per call so callers cannot mutate the shared default', () => {
    const first = getDefaultGraphSettings('docked');
    first.forces.repelStrength = 999;
    expect(getDefaultGraphSettings('docked').forces.repelStrength).toBe(
      GRAPH_FORCE_DEFAULTS.repelStrength,
    );
  });
});

describe('clampGraphSettings', () => {
  test('returns defaults for a non-object value', () => {
    expect(clampGraphSettings(null, 'docked')).toEqual(getDefaultGraphSettings('docked'));
    expect(clampGraphSettings('nope', 'docked')).toEqual(getDefaultGraphSettings('docked'));
    expect(clampGraphSettings(42, 'docked')).toEqual(getDefaultGraphSettings('docked'));
  });

  test('fills missing sections field by field instead of discarding the whole preset', () => {
    const result = clampGraphSettings({ display: { nodeSize: 2 } }, 'docked');
    expect(result.display.nodeSize).toBe(2);
    // Untouched siblings survive as defaults rather than becoming undefined.
    expect(result.display.linkThickness).toBe(1);
    expect(result.filters.showOrphans).toBe(true);
    expect(result.forces).toEqual(GRAPH_FORCE_DEFAULTS);
  });

  test('clamps out-of-range numbers to the bounds', () => {
    const result = clampGraphSettings(
      {
        display: { nodeSize: 99, linkThickness: -5, textFadeThreshold: 100 },
        forces: { repelStrength: 5000, linkDistance: 0 },
      },
      'docked',
    );
    expect(result.display.nodeSize).toBe(GRAPH_SETTINGS_BOUNDS.nodeSize.max);
    expect(result.display.linkThickness).toBe(GRAPH_SETTINGS_BOUNDS.linkThickness.min);
    expect(result.display.textFadeThreshold).toBe(GRAPH_SETTINGS_BOUNDS.textFadeThreshold.max);
    expect(result.forces.repelStrength).toBe(GRAPH_SETTINGS_BOUNDS.repelStrength.max);
    expect(result.forces.linkDistance).toBe(GRAPH_SETTINGS_BOUNDS.linkDistance.min);
  });

  test('falls back per field on NaN, Infinity, and wrong types', () => {
    const result = clampGraphSettings(
      {
        display: { nodeSize: Number.NaN, linkThickness: Number.POSITIVE_INFINITY, maxLabels: '20' },
        filters: { showOrphans: 'yes', query: 7 },
      },
      'docked',
    );
    expect(result.display.nodeSize).toBe(1);
    expect(result.display.linkThickness).toBe(1);
    expect(result.display.maxLabels).toBe(18);
    expect(result.filters.showOrphans).toBe(true);
    expect(result.filters.query).toBe('');
  });

  test('rounds the label budget to a whole number', () => {
    expect(clampGraphSettings({ display: { maxLabels: 12.7 } }, 'docked').display.maxLabels).toBe(
      13,
    );
  });

  test('keeps well-formed groups and drops malformed ones', () => {
    const result = clampGraphSettings(
      {
        groups: [
          { id: 'a', query: 'project', color: '#60a5fa' },
          { id: 'b', query: 'x', color: 'blue' }, // not a hex color
          { id: '', query: 'x', color: '#ffffff' }, // empty id
          { query: 'x', color: '#ffffff' }, // no id
          'nope',
          null,
          { id: 'c', query: 'draft', color: '#F472B6' },
        ],
      },
      'docked',
    );
    expect(result.groups).toEqual([
      { id: 'a', query: 'project', color: '#60a5fa' },
      { id: 'c', query: 'draft', color: '#F472B6' },
    ]);
  });

  test('caps the group list so a corrupt blob cannot flood the popover', () => {
    const groups = Array.from({ length: MAX_GRAPH_GROUPS + 5 }, (_, index) => ({
      id: `g${index}`,
      query: 'x',
      color: '#60a5fa',
    }));
    expect(clampGraphSettings({ groups }, 'docked').groups).toHaveLength(MAX_GRAPH_GROUPS);
  });

  test('truncates an overlong query rather than storing it unbounded', () => {
    const result = clampGraphSettings({ filters: { query: 'a'.repeat(500) } }, 'docked');
    expect(result.filters.query).toHaveLength(200);
  });
});

describe('readGraphSettings', () => {
  test('returns defaults when nothing is stored', () => {
    expect(readGraphSettings('docked', memoryStorage())).toEqual(getDefaultGraphSettings('docked'));
  });

  test('reads a stored preset', () => {
    const stored = getDefaultGraphSettings('docked');
    stored.display.nodeSize = 2.5;
    stored.filters.query = 'tag:draft';
    const settings = readGraphSettings(
      'docked',
      memoryStorage({ [DOCKED_KEY]: JSON.stringify(stored) }),
    );
    expect(settings.display.nodeSize).toBe(2.5);
    expect(settings.filters.query).toBe('tag:draft');
  });

  test('falls back to defaults on unparseable JSON', () => {
    expect(readGraphSettings('docked', memoryStorage({ [DOCKED_KEY]: '{oh no' }))).toEqual(
      getDefaultGraphSettings('docked'),
    );
  });

  test('keeps the two scopes independent', () => {
    const storage = memoryStorage();
    const docked = getDefaultGraphSettings('docked');
    docked.display.nodeSize = 3;
    writeGraphSettings('docked', docked, storage);

    expect(readGraphSettings('docked', storage).display.nodeSize).toBe(3);
    expect(readGraphSettings('fullscreen', storage).display.nodeSize).toBe(1);
    expect(Object.keys(storage.values)).toEqual([DOCKED_KEY]);
  });

  test('survives a storage whose getItem throws', () => {
    const throwing: GraphSettingsStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
    };
    expect(readGraphSettings('docked', throwing)).toEqual(getDefaultGraphSettings('docked'));
  });
});

describe('migration from the standalone external-URL toggle', () => {
  // The pre-settings build stored only this one boolean, per scope. A user
  // upgrading from it keeps the choice they made rather than silently losing it.
  test('adopts the legacy docked toggle when no preset exists', () => {
    const settings = readGraphSettings(
      'docked',
      memoryStorage({ 'ok-graph-docked-url-nodes-v1': 'true' }),
    );
    expect(settings.filters.showExternalNodes).toBe(true);
    // Everything else is still a default — the legacy key carried nothing more.
    expect(settings.display).toEqual(getDefaultGraphSettings('docked').display);
  });

  test('reads the fullscreen legacy key for the fullscreen scope only', () => {
    const storage = memoryStorage({ 'ok-graph-fullscreen-url-nodes-v1': 'true' });
    expect(readGraphSettings('fullscreen', storage).filters.showExternalNodes).toBe(true);
    expect(readGraphSettings('docked', storage).filters.showExternalNodes).toBe(false);
  });

  test('stops consulting the legacy key once a preset exists', () => {
    const preset = getDefaultGraphSettings('docked');
    preset.filters.showExternalNodes = false;
    const settings = readGraphSettings(
      'docked',
      memoryStorage({
        [DOCKED_KEY]: JSON.stringify(preset),
        'ok-graph-docked-url-nodes-v1': 'true',
      }),
    );
    expect(settings.filters.showExternalNodes).toBe(false);
  });
});

describe('writeGraphSettings', () => {
  test('persists a clamped preset under the scope key', () => {
    const storage = memoryStorage();
    const settings = getDefaultGraphSettings('fullscreen');
    settings.display.nodeSize = 99;
    writeGraphSettings('fullscreen', settings, storage);

    const written = JSON.parse(storage.values[FULLSCREEN_KEY]) as GraphSettings;
    expect(written.display.nodeSize).toBe(GRAPH_SETTINGS_BOUNDS.nodeSize.max);
  });

  test('survives a storage that throws', () => {
    const throwing: GraphSettingsStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    expect(() =>
      writeGraphSettings('docked', getDefaultGraphSettings('docked'), throwing),
    ).not.toThrow();
  });

  test('round-trips through read', () => {
    const storage = memoryStorage();
    const settings = getDefaultGraphSettings('docked');
    settings.filters = {
      query: '-archive tag:idea',
      showExternalNodes: true,
      showMissingNodes: false,
      showOrphans: false,
      showTagNodes: true,
      showFolderNodes: true,
    };
    settings.groups = [{ id: 'g1', query: 'project', color: '#60a5fa' }];
    writeGraphSettings('docked', settings, storage);
    expect(readGraphSettings('docked', storage)).toEqual(settings);
  });
});

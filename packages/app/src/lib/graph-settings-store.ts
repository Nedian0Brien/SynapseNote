// Persisted user controls for the link graph, split into the four sections the
// settings popover renders: Filters, Display, Forces, and Groups.
//
// The docked (right-rail) graph and the fullscreen graph keep SEPARATE presets.
// That is not a new split — the previous build already stored the external-URL
// toggle under two keys — and it matches how the two surfaces are actually used:
// the docked view is a 2-hop neighborhood that wants dense labels, the
// fullscreen view is the whole project and wants them sparse.
//
// Storage shape is a single JSON blob per scope. Parsing is deliberately
// field-tolerant: a blob written by a future build, hand-edited, or truncated
// mid-write degrades to defaults field by field rather than throwing away the
// whole preset (or throwing at module load, which would take the graph tab down).

export type GraphSettingsScope = 'docked' | 'fullscreen';

export interface GraphFilterSettings {
  /** Empty string means "no query filter". See `matchesGraphQuery` for the syntax. */
  query: string;
  showExternalNodes: boolean;
  /** Obsidian's "Existing files only", inverted: false hides unresolved wiki-link targets. */
  showMissingNodes: boolean;
  showOrphans: boolean;
  /** Synthesizes a node per frontmatter tag, with an edge to every page carrying it. */
  showTagNodes: boolean;
}

export interface GraphDisplaySettings {
  /** Multiplier on the drawn node radius. */
  nodeSize: number;
  linkThickness: number;
  showArrows: boolean;
  /** Zoom scale below which labels are not drawn at all. 0 draws them at every zoom. */
  textFadeThreshold: number;
  /** Upper bound on simultaneously placed labels — the collision planner's budget. */
  maxLabels: number;
}

export interface GraphForceSettings {
  centerStrength: number;
  /** Magnitude of the d3 many-body charge; applied as a negative (repelling) strength. */
  repelStrength: number;
  /** Multiplier on d3's per-link default strength, not an absolute value. */
  linkStrength: number;
  linkDistance: number;
}

export interface GraphGroup {
  id: string;
  /** Same query syntax as the Filters search box. An empty query never matches. */
  query: string;
  color: string;
}

export interface GraphSettings {
  filters: GraphFilterSettings;
  display: GraphDisplaySettings;
  forces: GraphForceSettings;
  groups: GraphGroup[];
}

export interface GraphSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEYS: Record<GraphSettingsScope, string> = {
  docked: 'ok-graph-settings-docked-v1',
  fullscreen: 'ok-graph-settings-fullscreen-v1',
};

// Read once for migration, never written. These held the external-URL toggle
// before the settings blob existed; a user who only ever ran that build keeps
// their choice on first load and the branch stops firing after the first write.
const LEGACY_URL_NODES_KEYS: Record<GraphSettingsScope, string> = {
  docked: 'ok-graph-docked-url-nodes-v1',
  fullscreen: 'ok-graph-fullscreen-url-nodes-v1',
};

/**
 * d3-force's own defaults, reproduced here so a multiplier of 1 is a true no-op:
 * `forceManyBody().strength(-30)`, `forceLink().distance(30)`, `forceCenter().strength(1)`.
 * Diverging from these would silently relayout every existing user's graph.
 */
export const GRAPH_FORCE_DEFAULTS: GraphForceSettings = {
  centerStrength: 1,
  repelStrength: 30,
  linkStrength: 1,
  linkDistance: 30,
};

// The label budget is the one default that differs by scope: the fullscreen view
// shows the whole project, so it deliberately runs a tighter budget than the
// docked 2-hop neighborhood to avoid flooding the canvas.
const DEFAULT_MAX_LABELS: Record<GraphSettingsScope, number> = {
  docked: 18,
  fullscreen: 10,
};

export const GRAPH_SETTINGS_BOUNDS = {
  nodeSize: { min: 0.25, max: 3 },
  linkThickness: { min: 0.25, max: 5 },
  textFadeThreshold: { min: 0, max: 4 },
  maxLabels: { min: 0, max: 200 },
  centerStrength: { min: 0, max: 2 },
  repelStrength: { min: 0, max: 300 },
  linkStrength: { min: 0, max: 3 },
  linkDistance: { min: 5, max: 300 },
} as const;

/** Guards against a corrupt blob inflating the popover into an unusable list. */
export const MAX_GRAPH_GROUPS = 12;

const MAX_GRAPH_QUERY_LENGTH = 200;

export function getDefaultGraphSettings(scope: GraphSettingsScope): GraphSettings {
  return {
    filters: {
      query: '',
      // Off by default, matching the pre-settings build: external URLs are
      // usually noise in a note graph, and the Globe button turns them on.
      showExternalNodes: false,
      showMissingNodes: true,
      showOrphans: true,
      showTagNodes: false,
    },
    display: {
      nodeSize: 1,
      linkThickness: 1,
      showArrows: true,
      // 1.8 is the zoom scale the pre-settings build hardcoded.
      textFadeThreshold: 1.8,
      maxLabels: DEFAULT_MAX_LABELS[scope],
    },
    forces: { ...GRAPH_FORCE_DEFAULTS },
    groups: [],
  };
}

function clampNumber(value: unknown, bounds: { min: number; max: number }, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value < bounds.min) return bounds.min;
  if (value > bounds.max) return bounds.max;
  return value;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readQuery(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return value.slice(0, MAX_GRAPH_QUERY_LENGTH);
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function readGroups(value: unknown, fallback: GraphGroup[]): GraphGroup[] {
  if (!Array.isArray(value)) return fallback;
  const groups: GraphGroup[] = [];
  for (const raw of value) {
    if (groups.length >= MAX_GRAPH_GROUPS) break;
    if (typeof raw !== 'object' || raw === null) continue;
    const candidate = raw as Partial<GraphGroup>;
    if (typeof candidate.id !== 'string' || candidate.id === '') continue;
    if (typeof candidate.color !== 'string' || !HEX_COLOR.test(candidate.color)) continue;
    groups.push({
      id: candidate.id,
      query: readQuery(candidate.query, ''),
      color: candidate.color,
    });
  }
  return groups;
}

/**
 * Field-by-field normalization of an untrusted value into a complete
 * `GraphSettings`. Exported so the popover can clamp live slider input through
 * exactly the same rules that guard what lands in storage.
 */
export function clampGraphSettings(value: unknown, scope: GraphSettingsScope): GraphSettings {
  const defaults = getDefaultGraphSettings(scope);
  if (typeof value !== 'object' || value === null) return defaults;

  const raw = value as Record<string, unknown>;
  const filters = (
    typeof raw.filters === 'object' && raw.filters !== null ? raw.filters : {}
  ) as Record<string, unknown>;
  const display = (
    typeof raw.display === 'object' && raw.display !== null ? raw.display : {}
  ) as Record<string, unknown>;
  const forces = (
    typeof raw.forces === 'object' && raw.forces !== null ? raw.forces : {}
  ) as Record<string, unknown>;

  return {
    filters: {
      query: readQuery(filters.query, defaults.filters.query),
      showExternalNodes: readBoolean(filters.showExternalNodes, defaults.filters.showExternalNodes),
      showMissingNodes: readBoolean(filters.showMissingNodes, defaults.filters.showMissingNodes),
      showOrphans: readBoolean(filters.showOrphans, defaults.filters.showOrphans),
      showTagNodes: readBoolean(filters.showTagNodes, defaults.filters.showTagNodes),
    },
    display: {
      nodeSize: clampNumber(
        display.nodeSize,
        GRAPH_SETTINGS_BOUNDS.nodeSize,
        defaults.display.nodeSize,
      ),
      linkThickness: clampNumber(
        display.linkThickness,
        GRAPH_SETTINGS_BOUNDS.linkThickness,
        defaults.display.linkThickness,
      ),
      showArrows: readBoolean(display.showArrows, defaults.display.showArrows),
      textFadeThreshold: clampNumber(
        display.textFadeThreshold,
        GRAPH_SETTINGS_BOUNDS.textFadeThreshold,
        defaults.display.textFadeThreshold,
      ),
      maxLabels: Math.round(
        clampNumber(display.maxLabels, GRAPH_SETTINGS_BOUNDS.maxLabels, defaults.display.maxLabels),
      ),
    },
    forces: {
      centerStrength: clampNumber(
        forces.centerStrength,
        GRAPH_SETTINGS_BOUNDS.centerStrength,
        defaults.forces.centerStrength,
      ),
      repelStrength: clampNumber(
        forces.repelStrength,
        GRAPH_SETTINGS_BOUNDS.repelStrength,
        defaults.forces.repelStrength,
      ),
      linkStrength: clampNumber(
        forces.linkStrength,
        GRAPH_SETTINGS_BOUNDS.linkStrength,
        defaults.forces.linkStrength,
      ),
      linkDistance: clampNumber(
        forces.linkDistance,
        GRAPH_SETTINGS_BOUNDS.linkDistance,
        defaults.forces.linkDistance,
      ),
    },
    groups: readGroups(raw.groups, defaults.groups),
  };
}

function readLegacyExternalNodes(
  storage: GraphSettingsStorage,
  scope: GraphSettingsScope,
): boolean | null {
  const raw = storage.getItem(LEGACY_URL_NODES_KEYS[scope]);
  if (raw === null) return null;
  return raw === 'true';
}

export function readGraphSettings(
  scope: GraphSettingsScope,
  storage?: GraphSettingsStorage,
): GraphSettings {
  try {
    const s = storage ?? localStorage;
    const raw = s.getItem(STORAGE_KEYS[scope]);
    if (raw === null) {
      const defaults = getDefaultGraphSettings(scope);
      const legacy = readLegacyExternalNodes(s, scope);
      if (legacy === null) return defaults;
      return {
        ...defaults,
        filters: { ...defaults.filters, showExternalNodes: legacy },
      };
    }
    return clampGraphSettings(JSON.parse(raw), scope);
  } catch {
    // Unparseable blob, or a host where localStorage access itself throws
    // (file://, Safari private mode, sandboxed iframe).
    return getDefaultGraphSettings(scope);
  }
}

export function writeGraphSettings(
  scope: GraphSettingsScope,
  settings: GraphSettings,
  storage?: GraphSettingsStorage,
): void {
  try {
    const s = storage ?? localStorage;
    s.setItem(STORAGE_KEYS[scope], JSON.stringify(clampGraphSettings(settings, scope)));
  } catch {
    // Quota exceeded — in-memory state holds for the session (mirrors right-rail-width-store).
  }
}

export function getInitialGraphSettings(scope: GraphSettingsScope): GraphSettings {
  // `typeof localStorage` is not safe when localStorage is a property getter
  // that throws on access, so the whole dispatch is wrapped — the caller needs
  // a synchronous value for `useState`'s initializer either way.
  try {
    if (typeof localStorage === 'undefined') return getDefaultGraphSettings(scope);
    return readGraphSettings(scope);
  } catch {
    return getDefaultGraphSettings(scope);
  }
}

/**
 * Deterministic cluster-to-color mapping for graph nodes.
 *
 * Improved palette optimized for knowledge graphs with:
 * - Better color harmony across 16 distinct hue families
 * - Stronger WCAG contrast ratios for both themes
 * - Semantic grouping: cool tones for structural concepts,
 *   vibrant tones for creative/breakthrough ideas, warm tones
 *   for processes and evaluation
 * - Reduced visual fatigue with balanced saturation levels
 *
 * The same cluster name will always map to the same color
 * (deterministic via stableHash).
 */

const DARK_PALETTE = [
  '#60a5fa', // Blue      - Knowledge, concepts, structure
  '#a78bfa', // Violet    - Research, analysis, methodology
  '#34d399', // Emerald   - Systems, frameworks, architecture
  '#f472b6', // Pink      - Creative, novel, breakthrough ideas
  '#fb923c', // Orange    - Processes, workflows, execution
  '#22d3ee', // Cyan      - Data, information, retrieval
  '#c084fc', // Purple    - Memory, cognition, intelligence
  '#4ade80', // Green     - Learning, adaptation, evolution
  '#f87171', // Red       - Challenges, gaps, critique
  '#eab308', // Yellow    - Insights, discoveries, patterns
  '#ec4899', // Hot Pink  - Innovation, experimentation
  '#06b67f', // Teal      - Integration, synthesis, connections
  '#8b5cf6', // Indigo    - Theory, abstraction, foundations
  '#f43f5e', // Rose      - Evaluation, assessment, quality
  '#0ea5e9', // Sky       - Exploration, discovery, frontiers
  '#a855f7', // Fuchsia   - Interdisciplinary, synthesis
] as const;

const LIGHT_PALETTE = [
  '#1e40af', // Deep Blue     - Knowledge, concepts, structure
  '#6b21a8', // Deep Violet   - Research, analysis, methodology
  '#166534', // Deep Green    - Systems, frameworks, architecture
  '#9f1239', // Deep Rose     - Creative, novel, breakthrough ideas
  '#9a3412', // Deep Orange   - Processes, workflows, execution
  '#164e63', // Deep Cyan     - Data, information, retrieval
  '#581c87', // Deep Purple   - Memory, cognition, intelligence
  '#166534', // Forest Green  - Learning, adaptation, evolution
  '#991b1b', // Deep Red      - Challenges, gaps, critique
  '#854d0e', // Deep Amber    - Insights, discoveries, patterns
  '#831843', // Deep Pink     - Innovation, experimentation
  '#0f766e', // Deep Teal     - Integration, synthesis, connections
  '#312e81', // Deep Indigo   - Theory, abstraction, foundations
  '#9f1239', // Deep Rose     - Evaluation, assessment, quality
  '#0c4a6e', // Deep Sky      - Exploration, discovery, frontiers
  '#6b21a8', // Deep Purple   - Interdisciplinary, synthesis
] as const;

export interface GraphColorPair {
  dark: string;
  light: string;
}

/**
 * The palettes zipped into theme pairs, for surfaces that let a user *pick* a
 * color instead of deriving one from a cluster name.
 *
 * A user's pick is stored once and rendered in both themes, so the two palettes
 * have to stay index-aligned to translate between them. Light entries that
 * repeat (three hues collapse to a shared deep tone) are dropped rather than
 * offered twice: in a swatch grid, two chips that look distinct in dark mode and
 * identical in light mode read as a bug. Cluster coloring is unaffected — it
 * still hashes across the full 16-entry palettes.
 */
export const GRAPH_COLOR_PAIRS: readonly GraphColorPair[] = (() => {
  const seenLight = new Set<string>();
  const pairs: GraphColorPair[] = [];
  for (const [index, dark] of DARK_PALETTE.entries()) {
    const light = LIGHT_PALETTE[index];
    if (seenLight.has(light)) continue;
    seenLight.add(light);
    pairs.push({ dark, light });
  }
  return pairs;
})();

function stableHash(str: string): number {
  let h = 2;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x5bd1e995);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

export function clusterColor(cluster: string, isDark: boolean): string {
  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  return palette[stableHash(cluster) % palette.length];
}

/**
 * A sibling variation on a colour: same family, visibly not the same paint.
 *
 * Folder territories take their palette slot from the topmost region they sit
 * under, so a whole subtree is one colour and the map does not repaint itself
 * as you descend. On its own that makes zooming into a region show a single
 * flat block — the children are all painted the parent's colour, so there is
 * nothing to see. An atlas answers this the same way: the provinces of a
 * country are distinct from each other AND recognisably of that country.
 *
 * Steps alternate outward from the base so the first few siblings — the common
 * case — land on the largest separations, and stay bounded in lightness so a
 * deep run never bleaches out or goes black.
 */
export function shiftGraphColorShade(hex: string, shadeIndex: number): string {
  if (shadeIndex <= 0) return hex;
  const rgb = parseHexColor(hex);
  if (!rgb) return hex;
  const direction = shadeIndex % 2 === 1 ? 1 : -1;
  const magnitude = Math.ceil(shadeIndex / 2);
  const { h, s, l } = rgbToHsl(rgb);
  return hslToHex({
    h: (((h + direction * magnitude * 13) % 360) + 360) % 360,
    s,
    l: Math.min(0.82, Math.max(0.18, l + direction * magnitude * 0.07)),
  });
}

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const value = hex.trim().replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;
  if (full.length !== 6 || !/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: Number.parseInt(full.slice(0, 2), 16) / 255,
    g: Number.parseInt(full.slice(2, 4), 16) / 255,
    b: Number.parseInt(full.slice(4, 6), 16) / 255,
  };
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): {
  h: number;
  s: number;
  l: number;
} {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  return { h: (((h * 60) % 360) + 360) % 360, s, l };
}

function hslToHex({ h, s, l }: { h: number; s: number; l: number }): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const channel = (value: number) =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

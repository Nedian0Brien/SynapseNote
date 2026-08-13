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
 * A colour laid over a backdrop at `amount` opacity, resolved to an opaque
 * colour rather than left as a translucent one.
 *
 * The territory layer needs this because canvas has no per-channel MAX blend.
 * Pixi had one, and the original leaned on it entirely: it drew every region
 * translucent onto a transparent layer and let MAX resolve the overlaps, so a
 * patch covered by four folders came out as dark as the deepest one and no
 * darker. Every canvas composite operation unions alpha instead — including
 * `destination-over`, which reverses the draw order but still stacks — so 57
 * regions at a tenth opacity each drove the layer to 98% opaque and the map
 * came out as one saturated wash.
 *
 * Baking the opacity into the colour moves the problem somewhere canvas can
 * solve it: the regions become OPAQUE, so `destination-over` gives each pixel
 * to exactly one of them and there is nothing left to accumulate, and the
 * result over the same backdrop is identical to having drawn it translucent.
 */
export function blendGraphColor(color: string, backdrop: string, amount: number): string {
  const source = parseHexColor(color);
  const target = parseHexColor(backdrop);
  if (!source || !target) return color;
  const ratio = Math.max(0, Math.min(1, amount));
  const channel = (from: number, to: number) => Math.round(to + (from - to) * ratio);
  return `rgb(${channel(source.r, target.r)}, ${channel(source.g, target.g)}, ${channel(source.b, target.b)})`;
}

function parseHexColor(value: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const hex = match[1];
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((part) => part + part)
          .join('')
      : hex;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

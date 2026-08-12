import { describe, expect, test } from 'bun:test';
import { clusterColor, shiftGraphColorShade } from './graph-colors';

describe('clusterColor', () => {
  test('returns deterministic output for the same input', () => {
    const color1 = clusterColor('retrieval', true);
    const color2 = clusterColor('retrieval', true);
    expect(color1).toBe(color2);
  });

  test('different clusters produce different colors for at least 5 inputs', () => {
    const clusters = [
      'retrieval',
      'long-term-memory',
      'planning',
      'knowledge-graphs',
      'evaluation',
    ];
    const darkColors = clusters.map((c) => clusterColor(c, true));
    const uniqueDark = new Set(darkColors);
    expect(uniqueDark.size).toBeGreaterThanOrEqual(5);
  });

  test('dark mode returns valid hex colors', () => {
    const clusters = [
      'retrieval',
      'long-term-memory',
      'planning',
      'knowledge-graphs',
      'evaluation',
    ];
    for (const c of clusters) {
      expect(clusterColor(c, true)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test('light mode returns valid hex colors', () => {
    const clusters = [
      'retrieval',
      'long-term-memory',
      'planning',
      'knowledge-graphs',
      'evaluation',
    ];
    for (const c of clusters) {
      expect(clusterColor(c, false)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test('dark and light palettes produce different colors for the same cluster', () => {
    const dark = clusterColor('retrieval', true);
    const light = clusterColor('retrieval', false);
    expect(dark).not.toBe(light);
  });

  test('handles single-character and long cluster names', () => {
    expect(clusterColor('x', true)).toMatch(/^#[0-9a-f]{6}$/i);
    expect(clusterColor('a-very-long-cluster-name-that-goes-on-and-on', false)).toMatch(
      /^#[0-9a-f]{6}$/i,
    );
  });
});

describe('shiftGraphColorShade', () => {
  const BASE = '#60a5fa';

  test('leaves the first sibling on the family colour', () => {
    expect(shiftGraphColorShade(BASE, 0)).toBe(BASE);
  });

  test('tells siblings apart, which is what makes a region look divided', () => {
    const shades = [0, 1, 2, 3, 4].map((index) => shiftGraphColorShade(BASE, index));
    expect(new Set(shades).size).toBe(shades.length);
  });

  test('keeps a sibling recognisably in the family rather than a new colour', () => {
    // Within a modest hue rotation of the base — a province, not another country.
    const shade = shiftGraphColorShade(BASE, 1);
    expect(shade).not.toBe(BASE);
    const channelsOf = (hex: string) =>
      [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
    const [r, g, b] = channelsOf(shade);
    const [br, bg, bb] = channelsOf(BASE);
    // Still blue-dominant, as the base is.
    expect(b).toBeGreaterThan(r);
    expect(bb).toBeGreaterThan(br);
    expect(Math.abs(g - bg)).toBeLessThan(90);
  });

  test('stays inside usable lightness however deep the run goes', () => {
    for (const index of [8, 20, 50]) {
      const shade = shiftGraphColorShade(BASE, index);
      const channels = [1, 3, 5].map((at) => Number.parseInt(shade.slice(at, at + 2), 16));
      const lightness = (Math.max(...channels) + Math.min(...channels)) / 2 / 255;
      expect(lightness).toBeGreaterThan(0.1);
      expect(lightness).toBeLessThan(0.9);
    }
  });

  test('hands back anything it cannot parse untouched', () => {
    expect(shiftGraphColorShade('not-a-color', 2)).toBe('not-a-color');
  });
});

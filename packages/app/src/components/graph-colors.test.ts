import { describe, expect, test } from 'bun:test';
import { blendGraphColor, clusterColor } from './graph-colors';

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

describe('blendGraphColor', () => {
  test('resolves a translucent tint to the opaque colour it would produce', () => {
    // Half of pure red over white is the same pixel either way.
    expect(blendGraphColor('#ff0000', '#ffffff', 0.5)).toBe('rgb(255, 128, 128)');
  });

  test('the ends are the two inputs', () => {
    expect(blendGraphColor('#123456', '#ffffff', 1)).toBe('rgb(18, 52, 86)');
    expect(blendGraphColor('#123456', '#ffffff', 0)).toBe('rgb(255, 255, 255)');
  });

  test('resolves against a dark backdrop too, not just a light one', () => {
    expect(blendGraphColor('#ffffff', '#000000', 0.25)).toBe('rgb(64, 64, 64)');
  });

  test('clamps rather than overshooting on a nonsense amount', () => {
    expect(blendGraphColor('#ff0000', '#ffffff', 5)).toBe('rgb(255, 0, 0)');
    expect(blendGraphColor('#ff0000', '#ffffff', -1)).toBe('rgb(255, 255, 255)');
  });

  test('accepts shorthand hex, and hands back anything it cannot parse', () => {
    expect(blendGraphColor('#f00', '#fff', 1)).toBe('rgb(255, 0, 0)');
    expect(blendGraphColor('oklch(1 0 0)', '#ffffff', 0.5)).toBe('oklch(1 0 0)');
  });
});

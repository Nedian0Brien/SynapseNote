import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadStyleManifest } from './build/style-manifest.ts';

const CSS = loadStyleManifest(join(__dirname, 'globals.css')).css;

describe('shell/page-header.css title layout', () => {
  test('long clickable filenames wrap inside the content column', () => {
    const titleRule = CSS.match(/\.page-header-title\s*\{(?<body>[^}]*)\}/)?.groups?.body;

    expect(titleRule).toContain('display: block');
    expect(titleRule).toContain('white-space: normal');
    expect(titleRule).toContain('overflow-wrap: anywhere');
  });

  test('the title and editor stay constrained to the available width', () => {
    const titleRule = CSS.match(/\.page-header-title\s*\{(?<body>[^}]*)\}/)?.groups?.body;

    expect(titleRule).toContain('min-width: 0');
    expect(titleRule).toContain('max-width: 100%');
    expect(titleRule).toContain('width: 100%');
  });

  test('the focus indicator is a spaced, animated neutral line', () => {
    const titleRule = CSS.match(/\.page-header-title\s*\{(?<body>[^}]*)\}/)?.groups?.body;
    const indicatorRule = CSS.match(/\.page-header-title::after\s*\{(?<body>[^}]*)\}/)?.groups
      ?.body;
    const focusRule = CSS.match(/\.page-header-title:focus::after\s*\{(?<body>[^}]*)\}/)?.groups
      ?.body;

    expect(titleRule).toContain('padding: 0 0 0.3rem');
    expect(indicatorRule).toContain('background: var(--border)');
    expect(indicatorRule).toContain('transform: scaleX(0)');
    expect(indicatorRule).toContain('transform-origin: left center');
    expect(focusRule).toContain(
      'animation: page-header-title-line-in 720ms cubic-bezier(0.22, 1, 0.36, 1) both',
    );
    expect(CSS).toContain('@keyframes page-header-title-line-in');
  });
});

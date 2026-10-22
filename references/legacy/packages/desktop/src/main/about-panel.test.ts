import { describe, expect, test } from 'bun:test';
import { buildAboutPanelOptions } from './about-panel.ts';

describe('buildAboutPanelOptions', () => {
  test('carries the version, copyright, GPL license, and no-warranty notice', () => {
    const opts = buildAboutPanelOptions('9.9.9');
    expect(opts.applicationVersion).toBe('9.9.9');
    expect(opts.copyright).toMatch(/Copyright \(C\) \d{4} SynapseNote contributors\./);
    expect(opts.copyright).toContain('Portions copyright (C) 2026 Inkeep, Inc.');
    expect(opts.copyright).toContain('GPL-3.0-or-later');
    expect(opts.copyright).toMatch(/NO WARRANTY/);
  });
});

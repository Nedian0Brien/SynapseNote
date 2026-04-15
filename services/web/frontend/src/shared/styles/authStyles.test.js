import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

describe('auth styles', () => {
  it('main entry loads auth.css', () => {
    const mainSource = readFileSync(path.resolve(process.cwd(), 'src/main.jsx'), 'utf8');

    expect(mainSource).toContain("./shared/styles/auth.css");
  });

  it('auth.css defines the login form selectors', () => {
    const cssSource = readFileSync(path.resolve(process.cwd(), 'src/shared/styles/auth.css'), 'utf8');

    expect(cssSource).toMatch(/\.login-screen\s*\{/);
    expect(cssSource).toMatch(/\.login-card\s*\{/);
    expect(cssSource).toMatch(/\.login-card__submit\s*\{/);
  });
});

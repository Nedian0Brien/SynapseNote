import { describe, expect, it } from 'vitest';
import { sampleCommands } from '../vendor/morrow/src/core/sample';
import type { DocNode } from '../vendor/morrow/src/core/model';

// every word of morrow's welcome guide as this app puts it in a new vault, with the renames of vite.config.ts
function guideText(): string {
  let next = 0;
  const words: string[] = [];
  const walk = (node: DocNode): void => {
    if (node.text) words.push(node.text);
    for (const child of node.content ?? []) walk(child);
  };
  for (const command of sampleCommands(() => `id${++next}`, Date.UTC(2026, 9, 19))) {
    if (command.type !== 'page.create') continue;
    if (command.title) words.push(command.title);
    if (command.doc) walk(command.doc as DocNode);
  }
  return words.join('\n');
}

describe('welcome guide', () => {
  const text = guideText();

  it('names this app and not morrow', () => {
    expect(text).toContain('Welcome to SynapseNote');
    expect(text).not.toContain('Morrow');
  });

  it('gives the keys of this app, not those of windows and linux', () => {
    for (const word of ['Ctrl', 'Alt ', 'Windows', 'Linux', 'middle click'])
      expect(text, word).not.toContain(word);
    for (const keys of ['⌘ N', '⌘ K', '⇧ ⌘ D', '⌥ ⌘ M', '⇧ ⌘ G', '⌥ ⌘ T', '⇧ ⌘ R', '⇧ ⌘ F', '⇧ ⌘ L', '⌃ ⌘ S'])
      expect(text, keys).toContain(keys);
  });

  it('does not say this app is open source, its licence is not decided', () => {
    expect(text).not.toMatch(/open source/i);
  });
});

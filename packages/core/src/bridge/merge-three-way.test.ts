import { describe, expect, test } from 'bun:test';
import { diff3Merge } from 'node-diff3';
import { mergeThreeWay } from './merge-three-way.ts';

/** diff3 over the whole documents, without the shared head/tail trim. Only
 *  conflict-free inputs are compared, so conflict resolution is not needed. */
function untrimmedMerge(base: string, user: string, agent: string): string | null {
  const regions = diff3Merge(user.split('\n'), base.split('\n'), agent.split('\n'));
  const parts: string[] = [];
  for (const region of regions) {
    if (!('ok' in region) || !region.ok) return null;
    parts.push(region.ok.join('\n'));
  }
  return parts.join('\n');
}

function makeDoc(blocks: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < blocks; i++) {
    lines.push(i % 7 === 0 ? `## Section ${i}` : `Paragraph ${i} with some words.`, '');
  }
  return lines;
}

// Deterministic pseudo-random numbers so a failure reproduces.
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

type Edit = (lines: string[], at: number) => void;
const EDITS: Edit[] = [
  (lines, at) => {
    lines[at] = `${lines[at]} edited`;
  },
  (lines, at) => {
    lines.splice(at, 0, 'Inserted line.', '');
  },
  (lines, at) => {
    lines.splice(at, 2);
  },
  (lines, at) => {
    lines[at] = `${lines[at]}   `;
  },
];

describe('mergeThreeWay', () => {
  test('equals a whole-document diff3 merge for local edits on both sides', () => {
    const random = rng(7);
    let compared = 0;
    for (let round = 0; round < 300; round++) {
      const base = makeDoc(40);
      const user = [...base];
      const agent = [...base];
      const userAt = Math.floor(random() * (user.length - 2));
      const agentAt = Math.floor(random() * (agent.length - 2));
      EDITS[Math.floor(random() * EDITS.length)](user, userAt);
      EDITS[Math.floor(random() * EDITS.length)](agent, agentAt);
      const expected = untrimmedMerge(base.join('\n'), user.join('\n'), agent.join('\n'));
      if (expected === null) continue; // overlapping edits conflict
      expect(mergeThreeWay(base.join('\n'), user.join('\n'), agent.join('\n'))).toBe(expected);
      compared++;
    }
    expect(compared).toBeGreaterThan(200);
  });

  test('both sides deleting the same lines leaves no stray blank line', () => {
    const base = ['Intro.', '', 'Gone.', '', 'Outro.'].join('\n');
    const both = ['Intro.', '', 'Outro.'].join('\n');
    expect(mergeThreeWay(base, both, `${both}`)).toBe('Intro.\n\nOutro.');
    const user = ['Intro.', '', 'Outro.', '', 'User.'].join('\n');
    const agent = ['Agent.', '', 'Intro.', '', 'Outro.'].join('\n');
    expect(mergeThreeWay(base, user, agent)).toBe('Agent.\n\nIntro.\n\nOutro.\n\nUser.');
  });

  test('keeps both sides of edits far apart in a long document', () => {
    const base = makeDoc(2500);
    const user = [...base];
    const agent = [...base];
    user[2400] = `${user[2400]} from the user`;
    agent[10] = `${agent[10]}   `;
    const merged = mergeThreeWay(base.join('\n'), user.join('\n'), agent.join('\n')).split('\n');
    expect(merged.length).toBe(base.length);
    expect(merged[2400]).toBe(user[2400]);
    expect(merged[10]).toBe(agent[10]);
  });
});

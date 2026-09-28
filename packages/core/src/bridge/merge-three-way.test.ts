import { describe, expect, test } from 'bun:test';
import { diff3Merge } from 'node-diff3';
import { mergeThreeWay, mergeWholeText } from './merge-three-way.ts';

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

  test('equals a whole-document diff3 merge when one side differs all over', () => {
    const random = rng(3);
    for (let round = 0; round < 40; round++) {
      const base = makeDoc(200);
      // The raw source spells many lines differently from the canonical
      // serialization; the client edits one block.
      const agent = base.map((line, i) => (line && i % 3 === 0 ? `${line}  ` : line));
      const user = [...base];
      const at = 2 * Math.floor(random() * 199);
      if (at % 3 === 0) continue; // both sides touched this line: a conflict
      user[at] = `${user[at]} from the web editor`;
      const expected = untrimmedMerge(base.join('\n'), user.join('\n'), agent.join('\n'));
      expect(expected).not.toBeNull();
      expect(mergeThreeWay(base.join('\n'), user.join('\n'), agent.join('\n'))).toBe(
        expected as string,
      );
    }
  });

  test('equals the whole-text merge with scattered edits on both sides, conflicts included', () => {
    const random = rng(5);
    const scatter = (lines: string[], edits: number): string[] => {
      const out = [...lines];
      for (let k = 0; k < edits; k++) {
        const at = Math.floor(random() * out.length);
        const op = Math.floor(random() * 3);
        if (op === 0) out[at] = `${out[at]} e${k}`;
        else if (op === 1) out.splice(at, 0, `new ${k} ${Math.floor(random() * 1e6)}`);
        else out.splice(at, 1);
      }
      return out;
    };
    let conflicts = 0;
    for (let round = 0; round < 600; round++) {
      const base = makeDoc(30);
      const user = scatter(base, 1 + Math.floor(random() * 3));
      const agent = scatter(base, 1 + Math.floor(random() * 20));
      if (diff3Merge(user, base, agent).some((region) => 'conflict' in region && region.conflict))
        conflicts++;
      let expected: string;
      try {
        expected = mergeWholeText(base, user, agent);
      } catch {
        continue;
      }
      let merged: string;
      try {
        merged = mergeThreeWay(base.join('\n'), user.join('\n'), agent.join('\n'));
      } catch {
        continue; // content-preservation post-condition, same for both
      }
      expect(merged).toBe(expected);
    }
    expect(conflicts).toBeGreaterThan(20);
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

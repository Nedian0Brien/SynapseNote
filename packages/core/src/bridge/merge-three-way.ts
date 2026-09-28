import DiffMatchPatch from 'diff-match-patch';
import { diff3Merge } from 'node-diff3';
import { substantiveLineCounts } from './growth-detect.ts';
import { fnv1aDigest } from './hash-util.ts';

const dmp = new DiffMatchPatch();
dmp.Match_Threshold = 0.5;

export function mergeThreeWay(baseline: string, userText: string, agentText: string): string {
  const result = mergeThreeWayImpl(baseline, userText, agentText);
  assertContentPreservation(baseline, userText, agentText, result);
  return result;
}

function mergeThreeWayImpl(baseline: string, userText: string, agentText: string): string {
  if (baseline === userText) return agentText;
  if (baseline === agentText) return userText;
  if (userText === agentText) return userText;

  const userLines = userText.split('\n');
  const baseLines = baseline.split('\n');
  const agentLines = agentText.split('\n');
  // node-diff3's LCS compares every line with every equal line of the other
  // side, so on a long document its blank lines alone make one whole-text
  // merge take seconds. Lines all three share at the start and end are
  // stable regions diff3 copies through, and so is every line that occurs
  // exactly once in each version, in the same order (patience-diff anchors).
  // Merging per segment between them gives the whole-text result when no
  // segment conflicts. A conflict is different: the segment boundary moves
  // diff3's alignment of blank lines, which changes the conflict region the
  // character-level resolver sees (it duplicated lines in fuzzing). Any
  // conflict therefore reruns the merge over the whole text.
  const shortest = Math.min(userLines.length, baseLines.length, agentLines.length);
  let head = 0;
  while (
    head < shortest &&
    userLines[head] === baseLines[head] &&
    baseLines[head] === agentLines[head]
  )
    head++;
  let tail = 0;
  while (
    tail < shortest - head &&
    userLines[userLines.length - 1 - tail] === baseLines[baseLines.length - 1 - tail] &&
    baseLines[baseLines.length - 1 - tail] === agentLines[agentLines.length - 1 - tail]
  )
    tail++;
  const user = userLines.slice(head, userLines.length - tail);
  const base = baseLines.slice(head, baseLines.length - tail);
  const agent = agentLines.slice(head, agentLines.length - tail);

  const parts: string[] = [];
  if (head > 0) parts.push(baseLines.slice(0, head).join('\n'));
  let from = { user: 0, base: 0, agent: 0 };
  let clean = true;
  for (const anchor of stableAnchors(user, base, agent)) {
    clean = mergeCleanSegment(
      user.slice(from.user, anchor.user),
      base.slice(from.base, anchor.base),
      agent.slice(from.agent, anchor.agent),
      parts,
    );
    if (!clean) break;
    parts.push(base[anchor.base]);
    from = { user: anchor.user + 1, base: anchor.base + 1, agent: anchor.agent + 1 };
  }
  if (clean) {
    clean = mergeCleanSegment(
      user.slice(from.user),
      base.slice(from.base),
      agent.slice(from.agent),
      parts,
    );
  }
  if (!clean) return mergeWholeText(baseLines, userLines, agentLines);
  if (tail > 0) parts.push(baseLines.slice(baseLines.length - tail).join('\n'));

  return parts.join('\n');
}

/** The line merge over the whole text — what `mergeThreeWay` equals. Exported for tests. */
export function mergeWholeText(
  baseLines: string[],
  userLines: string[],
  agentLines: string[],
): string {
  const parts: string[] = [];
  mergeSegment(userLines, baseLines, agentLines, parts);
  return parts.join('\n');
}

/** diff3 one segment into `parts`; false (nothing appended) if it conflicts. */
function mergeCleanSegment(
  user: string[],
  base: string[],
  agent: string[],
  parts: string[],
): boolean {
  if (user.length === 0 && base.length === 0 && agent.length === 0) return true;
  const regions = diff3Merge(user, base, agent);
  if (regions.some((region) => !('ok' in region && region.ok))) return false;
  for (const region of regions) parts.push((region as { ok: string[] }).ok.join('\n'));
  return true;
}

/** diff3 one segment, appending its merged lines to `parts`. */
function mergeSegment(user: string[], base: string[], agent: string[], parts: string[]): void {
  if (user.length === 0 && base.length === 0 && agent.length === 0) return;
  const regions = diff3Merge(user, base, agent);
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    if ('ok' in region && region.ok) {
      parts.push(region.ok.join('\n'));
    } else if ('conflict' in region && region.conflict) {
      const conflictBase = region.conflict.o.join('\n');
      const conflictUser = region.conflict.a.join('\n');
      const conflictAgent = region.conflict.b.join('\n');
      parts.push(mergeConflictRegion(conflictBase, conflictUser, conflictAgent));
    }
  }
}

/**
 * Lines that occur exactly once in each version, taken in base order while
 * they also increase in the other two (greedy). A line moved between
 * versions only costs anchors, never correctness: segments stay aligned.
 */
function stableAnchors(
  user: string[],
  base: string[],
  agent: string[],
): { user: number; base: number; agent: number }[] {
  const uniqueIndex = (lines: string[]): Map<string, number> => {
    const index = new Map<string, number>();
    lines.forEach((line, i) => index.set(line, index.has(line) ? -1 : i));
    return index;
  };
  const inUser = uniqueIndex(user);
  const inBase = uniqueIndex(base);
  const inAgent = uniqueIndex(agent);
  const anchors: { user: number; base: number; agent: number }[] = [];
  let lastUser = -1;
  let lastAgent = -1;
  for (let b = 0; b < base.length; b++) {
    const line = base[b];
    if (inBase.get(line) !== b) continue;
    const u = inUser.get(line) ?? -1;
    const a = inAgent.get(line) ?? -1;
    if (u > lastUser && a > lastAgent) {
      anchors.push({ user: u, base: b, agent: a });
      lastUser = u;
      lastAgent = a;
    }
  }
  return anchors;
}

export type BridgeMergeContentLossSide = 'user' | 'agent';

export type BridgeMergeContentLossWhich = 'substring' | 'order' | 'growth';

export interface BridgeMergeContentLossInfo {
  baseline: string;
  userText: string;
  agentText: string;
  result: string;
  lostSubstrings: string[];
  which: BridgeMergeContentLossWhich;
  side: BridgeMergeContentLossSide;
}

interface RedactedLostSubstring {
  len: number;
  digest: string;
}

export interface BridgeMergeContentLossLogPayload {
  event: 'bridge-merge-content-loss';
  which: BridgeMergeContentLossWhich;
  side: BridgeMergeContentLossSide;
  baselineLen: number;
  userTextLen: number;
  agentTextLen: number;
  resultLen: number;
  lostSubstrings: RedactedLostSubstring[] | string[];
  redacted: boolean;
}

function redactLostSubstrings(lost: string[]): RedactedLostSubstring[] {
  return lost.map((s) => ({ len: s.length, digest: fnv1aDigest(s) }));
}

export class BridgeMergeContentLossError extends Error {
  readonly info: BridgeMergeContentLossInfo;

  constructor(info: BridgeMergeContentLossInfo) {
    const preview = info.lostSubstrings
      .map((s) => JSON.stringify(s.length > 80 ? `${s.slice(0, 77)}...` : s))
      .join(', ');
    super(`Bridge merge content loss (which=${info.which}, side=${info.side}): ${preview}`);
    this.name = 'BridgeMergeContentLossError';
    this.info = info;
  }

  toLog(opts?: { verbose?: boolean }): BridgeMergeContentLossLogPayload {
    const verbose = opts?.verbose === true;
    return {
      event: 'bridge-merge-content-loss',
      which: this.info.which,
      side: this.info.side,
      baselineLen: this.info.baseline.length,
      userTextLen: this.info.userText.length,
      agentTextLen: this.info.agentText.length,
      resultLen: this.info.result.length,
      lostSubstrings: verbose
        ? this.info.lostSubstrings
        : redactLostSubstrings(this.info.lostSubstrings),
      redacted: !verbose,
    };
  }
}

function extractUniqueSegments(base: string, derived: string): string[] {
  if (base === derived) return [];
  const diffs = dmp.diff_main(base, derived);
  dmp.diff_cleanupSemantic(diffs);
  const out: string[] = [];
  for (const [op, data] of diffs) {
    if (op !== 1 /* INSERT */) continue;
    for (const line of data.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      out.push(trimmed);
    }
  }
  return out;
}

function findReorderedSegment(result: string, segments: string[]): string | null {
  let cursor = 0;
  for (const seg of segments) {
    const idx = result.indexOf(seg, cursor);
    if (idx < 0) {
      const earlierIdx = result.indexOf(seg);
      if (earlierIdx < 0) continue; // absent → substring check reports it
      return seg; // appears earlier → order violation
    }
    cursor = idx + seg.length;
  }
  return null;
}

/**
 * Invariant (c) + order side-check: every maximal-unique-substring of
 * `(userText \ baseline)` and `(agentText \ baseline)` appears in `result`,
 * and each side's segments appear in result in the same relative order
 * they appear in their source. Throws `BridgeMergeContentLossError`
 * on the first violation; callers decide environment policy.
 *
 * Complexity: O(n log n) for DMP diff per side + O(k · m) for substring
 * checks (k = segment count, m = result length) + O(k) for order check.
 * Empirically sub-millisecond on ~10 KB markdown with k ≤ ~10 segments.
 */
export function assertContentPreservation(
  baseline: string,
  userText: string,
  agentText: string,
  result: string,
): void {
  const userSegments = extractUniqueSegments(baseline, userText);
  const agentSegments = extractUniqueSegments(baseline, agentText);

  const userMissing = userSegments.filter((s) => !result.includes(s));
  if (userMissing.length > 0) {
    throw new BridgeMergeContentLossError({
      baseline,
      userText,
      agentText,
      result,
      lostSubstrings: userMissing,
      which: 'substring',
      side: 'user',
    });
  }
  const agentMissing = agentSegments.filter((s) => !result.includes(s));
  if (agentMissing.length > 0) {
    throw new BridgeMergeContentLossError({
      baseline,
      userText,
      agentText,
      result,
      lostSubstrings: agentMissing,
      which: 'substring',
      side: 'agent',
    });
  }

  const userReordered = findReorderedSegment(result, userSegments);
  if (userReordered !== null) {
    throw new BridgeMergeContentLossError({
      baseline,
      userText,
      agentText,
      result,
      lostSubstrings: [userReordered],
      which: 'order',
      side: 'user',
    });
  }
  const agentReordered = findReorderedSegment(result, agentSegments);
  if (agentReordered !== null) {
    throw new BridgeMergeContentLossError({
      baseline,
      userText,
      agentText,
      result,
      lostSubstrings: [agentReordered],
      which: 'order',
      side: 'agent',
    });
  }

  const baselineCounts = substantiveLineCounts(baseline);
  const userCounts = substantiveLineCounts(userText);
  const agentCounts = substantiveLineCounts(agentText);
  for (const [line, count] of substantiveLineCounts(result)) {
    if (count < 2) continue;
    const maxInput = Math.max(
      baselineCounts.get(line) ?? 0,
      userCounts.get(line) ?? 0,
      agentCounts.get(line) ?? 0,
    );
    if (count > maxInput) {
      throw new BridgeMergeContentLossError({
        baseline,
        userText,
        agentText,
        result,
        lostSubstrings: [line],
        which: 'growth',
        side: 'user',
      });
    }
  }
}

function mergeConflictRegion(base: string, user: string, agent: string): string {
  if (user === '') return agent;
  if (agent === '') return user;

  const patches = dmp.patch_make(base, user);
  const [merged, flags] = dmp.patch_apply(patches, agent);

  if (flags.some((f) => !f)) {
    console.warn(
      JSON.stringify({
        event: 'bridge-merge-patch-drop',
        applied: flags.filter(Boolean).length,
        total: flags.length,
        regionSize: agent.length,
      }),
    );
  }

  return merged;
}

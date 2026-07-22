import { readFmRegionWithError } from '@nedian0brien/synapsenote-core';
import { databaseRecordMetadata } from '@/lib/database-record-page';

const FENCE = /^---[\t ]*$/;

/** End offset (exclusive) of database-owned frontmatter, including its newline. */
export function databaseFrontmatterProtectionEnd(source: string): number | null {
  const firstBreak = source.indexOf('\n');
  const firstLine = (firstBreak < 0 ? source : source.slice(0, firstBreak)).replace(/\r$/, '');
  if (!FENCE.test(firstLine)) return null;
  const { map, parseError } = readFmRegionWithError(source);
  if (parseError || !databaseRecordMetadata(map)) return null;

  let lineStart = firstBreak < 0 ? source.length : firstBreak + 1;
  while (lineStart < source.length) {
    const nextBreak = source.indexOf('\n', lineStart);
    const lineEnd = nextBreak < 0 ? source.length : nextBreak;
    const line = source.slice(lineStart, lineEnd).replace(/\r$/, '');
    if (FENCE.test(line)) return nextBreak < 0 ? lineEnd : nextBreak + 1;
    lineStart = nextBreak < 0 ? source.length : nextBreak + 1;
  }
  return null;
}

export function sourceChangeTouchesDatabaseFrontmatter(
  source: string,
  changedRanges: readonly { from: number; to: number }[],
): boolean {
  const protectedEnd = databaseFrontmatterProtectionEnd(source);
  if (protectedEnd === null) return false;
  return changedRanges.some(({ from, to }) => from < protectedEnd || to < protectedEnd);
}

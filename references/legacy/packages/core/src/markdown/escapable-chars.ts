/**
 * ASCII punctuation — the only characters CommonMark lets a backslash escape
 * (spec §2.4). A backslash before any other character is a literal backslash.
 *
 * Parse and serialize must agree on this set: the parser marks `\X` as an
 * escaped `X` only for these characters, so the serializer may write `\X`
 * only for them too. Writing `\` before anything else adds a literal
 * backslash that the next parse keeps, and every round trip adds another.
 */
export const ESCAPABLE_CHARS: ReadonlySet<string> = new Set(
  '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'.split(''),
);

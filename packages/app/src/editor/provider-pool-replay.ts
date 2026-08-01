/** Origin used for a one-time local replay after an epoch recycle. */
export const TAB_REPLAY_ORIGIN = Object.freeze({ kind: 'tab-replay' } as const);

/**
 * Claim a buffered update before applying it. Deleting first is intentional:
 * a re-entrant synced event or an `applyUpdate` exception cannot replay the
 * same local delta twice onto the newly established lineage.
 */
export function takeBufferedReplay(
  updates: Map<string, Uint8Array>,
  docName: string,
): Uint8Array | undefined {
  const update = updates.get(docName);
  if (update !== undefined) updates.delete(docName);
  return update;
}

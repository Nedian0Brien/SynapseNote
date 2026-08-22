/**
 * Shared constants and utilities for agent flash plugins (WYSIWYG + Source).
 */
import type * as Y from 'yjs';
import type { AgentFlashEntry } from '../types/awareness';

/**
 * Duration of the inline AI rewrite animation in milliseconds. Calibrated
 * against Apple Writing Tools' rewrite transition (WWDC25 265, 11:17–11:19).
 * https://developer.apple.com/videos/play/wwdc2025/265/?time=677
 */
export const FLASH_DURATION_MS = 900;

/** Minimum interval between consecutive flashes in milliseconds. */
export const FLASH_DEBOUNCE_MS = 500;

/** Time-to-live for activity map entries in milliseconds (auto-evicted). */
export const ACTIVITY_TTL_MS = 30_000;

/**
 * Auto-evict activity entries older than ACTIVITY_TTL_MS.
 * Called on each observation to prevent unbounded growth.
 */
export function evictStaleEntries(activityMap: Y.Map<unknown>): void {
  const now = Date.now();
  for (const [key, value] of activityMap.entries()) {
    const entry = value as AgentFlashEntry;
    if (entry.timestamp && now - entry.timestamp > ACTIVITY_TTL_MS) {
      activityMap.delete(key);
    }
  }
}

/**
 * Check if the activity map has entries newer than the given timestamp.
 */
export function hasNewEntries(activityMap: Y.Map<unknown>, since: number): boolean {
  for (const [, value] of activityMap.entries()) {
    const entry = value as AgentFlashEntry;
    if (entry.timestamp && entry.timestamp > since) {
      return true;
    }
  }
  return false;
}

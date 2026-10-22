import { databasePageTargetToHash, navigateToDatabaseHash } from '@/lib/database-navigation';
import {
  type DatabaseRecordNavigationState,
  databaseRecordNavigationHash,
  databaseRecordNavigationOriginHash,
} from '@/lib/database-record-navigation';

export function databaseRecordPageHash(
  navigation: DatabaseRecordNavigationState,
  index: number,
): string | null {
  return databaseRecordNavigationHash(navigation, index);
}

export function databaseRecordPageOriginHash(navigation: DatabaseRecordNavigationState): string {
  return databaseRecordNavigationOriginHash(navigation);
}

export function databaseRecordPageFallbackHash(databaseId: string, sourceId: string): string {
  return databasePageTargetToHash({ databaseId, sourceId });
}

export function navigateToDatabaseRecordPageHash(hash: string): void {
  navigateToDatabaseHash(hash);
}

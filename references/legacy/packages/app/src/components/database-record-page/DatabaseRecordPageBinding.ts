import type { DatabaseDescription } from '@/lib/database-catalog-client';

export type DatabaseRecordPageBindingState =
  | { status: 'idle' | 'loading'; key: string | null; description: null }
  | { status: 'ready'; key: string; description: DatabaseDescription }
  | { status: 'error'; key: string; description: null; message: string };

export function bindingMatchesMetadata(
  binding: DatabaseRecordPageBindingState,
  metadataKey: string | null,
): boolean {
  return metadataKey !== null && binding.status === 'ready' && binding.key === metadataKey;
}

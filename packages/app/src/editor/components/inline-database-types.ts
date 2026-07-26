import type { DatabaseLinkedViewSettings } from '@nedian0brien/synapsenote-core';

export interface InlineDatabaseReferenceData {
  databaseId: string;
  sourceId: string;
  viewId: string;
  mode: 'inline' | 'full-page';
  viewOverrides?: DatabaseLinkedViewSettings;
}

export type InlineDatabaseReference =
  | { success: true; data: InlineDatabaseReferenceData }
  | { success: false };

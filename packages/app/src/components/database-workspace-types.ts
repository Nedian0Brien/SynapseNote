import type { DatabaseContextInspectionScope } from '@nedian0brien/synapsenote-server';
import type { DatabaseViewManagerInitialAction } from '@/components/DatabaseViewManagerDialog';
import type { DatabasePasteChange } from '@/lib/database-tsv';
import type { DatabaseInitialRecordAction, DatabaseTableTarget } from './database-table-types';

export type DatabaseTableDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenContextInspector?: (scope?: DatabaseContextInspectionScope) => void;
  onOpenAgentRuns?: () => void;
  onCreationCancelled?: () => void;
  initialTarget?: DatabaseTableTarget;
  initialAction?: 'create';
  /** Use the document-native Notion blank path instead of the admin wizard. */
  creationExperience?: 'admin' | 'notion';
  initialRecordAction?: DatabaseInitialRecordAction;
  /** Paste changes forwarded from an inline view into the canonical review surface. */
  initialTablePaste?: readonly DatabasePasteChange[];
  /** Optional reviewed surface to open when an inline view delegates a control. */
  initialDatabaseSurface?: 'properties' | 'options' | 'view-settings' | 'view-manager' | 'filters';
  /** Optional reviewed saved-view action forwarded from an inline block. */
  initialViewAction?: DatabaseViewManagerInitialAction;
  initialPropertyId?: string;
  initialSelectedRecordIds?: readonly string[];
  presentation?: 'dialog' | 'page' | 'canvas';
};

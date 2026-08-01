import type {
  DatabaseDefinition,
  DatabaseSource,
  DatabaseView,
} from '@nedian0brien/synapsenote-core';
import type { Dispatch, SetStateAction } from 'react';
import type { SavedViewSettingsDraft } from './database-saved-view-settings-draft';

/** Shared narrow contracts for settings panels; no panel reaches into a controller. */
export interface SavedViewSettingsPanelProps {
  database?: DatabaseDefinition;
  draft: SavedViewSettingsDraft;
  setDraft: Dispatch<SetStateAction<SavedViewSettingsDraft>>;
  source: DatabaseSource;
  view: DatabaseView;
}

export interface DatabaseSavedViewSettingsDialogProps {
  database?: DatabaseDefinition;
  initialSortPropertyId?: string;
  onOpenChange: (open: boolean) => void;
  onSave: (view: DatabaseView) => void;
  open: boolean;
  source: DatabaseSource;
  view: DatabaseView;
}

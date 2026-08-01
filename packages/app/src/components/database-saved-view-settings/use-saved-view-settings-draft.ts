import type { DatabaseSource, DatabaseView } from '@nedian0brien/synapsenote-core';
import { useEffect, useRef, useState } from 'react';
import {
  compileSavedViewDesiredState,
  createSavedViewSettingsDraft,
  type SavedViewSettingsDraft,
} from './database-saved-view-settings-draft';

interface SavedViewSettingsDraftInput {
  initialSortPropertyId?: string;
  open: boolean;
  source: DatabaseSource;
  view: DatabaseView;
}

/** Owns draft lifetime, including reset on cancel and when another view opens. */
export function useSavedViewSettingsDraft({
  initialSortPropertyId,
  open,
  source,
  view,
}: SavedViewSettingsDraftInput) {
  const [draft, setDraft] = useState<SavedViewSettingsDraft>(() =>
    createSavedViewSettingsDraft(view, source, initialSortPropertyId),
  );
  const previousOpen = useRef(open);
  const previousViewId = useRef(view.id);

  useEffect(() => {
    const opensAgain = open && !previousOpen.current;
    const opensAnotherView = open && previousViewId.current !== view.id;
    if (opensAgain || opensAnotherView) {
      setDraft(createSavedViewSettingsDraft(view, source, initialSortPropertyId));
    }
    previousOpen.current = open;
    previousViewId.current = view.id;
  }, [initialSortPropertyId, open, source, view]);

  const reset = () => setDraft(createSavedViewSettingsDraft(view, source, initialSortPropertyId));
  const compile = () => compileSavedViewDesiredState(view, draft);
  return { compile, draft, reset, setDraft };
}

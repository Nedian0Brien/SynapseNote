import { useEffect, useRef, useState } from 'react';
import type { TagSummaryEntry } from '@/editor/extensions/tag-suggestion';
import {
  fetchDocsForTag,
  fetchTagsList,
  filterTagList,
  parseTagPaletteQuery,
  type TagDocEntry,
} from '../command-palette-tag-search';
import type { CommandPaletteLoadStatus } from './use-command-palette-session';

/** Owns lazy tag-index loading and exact-tag document-membership state. */
export function useCommandPaletteTags({
  deferredQuery,
  open,
  semanticMode,
}: {
  deferredQuery: string;
  open: boolean;
  semanticMode: boolean;
}) {
  const [tagsList, setTagsList] = useState<TagSummaryEntry[]>([]);
  const [tagsListStatus, setTagsListStatus] = useState<CommandPaletteLoadStatus>('idle');
  const [tagDocs, setTagDocs] = useState<TagDocEntry[]>([]);
  const [tagDocsStatus, setTagDocsStatus] = useState<CommandPaletteLoadStatus>('idle');
  const tagsListFetchedRef = useRef(false);
  const knownTagNames = new Set(tagsList.map((tag) => tag.name));
  const paletteMode = semanticMode
    ? ({ kind: 'normal', query: deferredQuery } as const)
    : parseTagPaletteQuery(deferredQuery, knownTagNames);
  const isTagMode = paletteMode.kind !== 'normal';
  const tagDocsTarget = paletteMode.kind === 'tag-docs' ? paletteMode.tagName : null;

  useEffect(() => {
    if (open) return;
    setTagsList([]);
    setTagsListStatus('idle');
    tagsListFetchedRef.current = false;
    setTagDocs([]);
    setTagDocsStatus('idle');
  }, [open]);

  useEffect(() => {
    if (!open || !isTagMode || tagsListFetchedRef.current) return;
    tagsListFetchedRef.current = true;
    setTagsListStatus('loading');
    let cancelled = false;
    void fetchTagsList()
      .then((tags) => {
        if (cancelled) return;
        setTagsList(tags);
        setTagsListStatus('success');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('[command-palette-tag] fetch tags failed', error);
        setTagsList([]);
        setTagsListStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [isTagMode, open]);

  useEffect(() => {
    if (!open || tagDocsTarget === null) {
      setTagDocs([]);
      setTagDocsStatus('idle');
      return;
    }
    setTagDocsStatus('loading');
    setTagDocs([]);
    let cancelled = false;
    void fetchDocsForTag(tagDocsTarget)
      .then((docs) => {
        if (cancelled) return;
        setTagDocs(docs);
        setTagDocsStatus('success');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('[command-palette-tag] fetch tag docs failed', error);
        setTagDocs([]);
        setTagDocsStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [open, tagDocsTarget]);

  return {
    isTagMode,
    paletteMode,
    tagDocs,
    tagDocsStatus,
    tagListItems: paletteMode.kind === 'tag-list' ? filterTagList(tagsList, paletteMode.query) : [],
    tagsListStatus,
  };
}

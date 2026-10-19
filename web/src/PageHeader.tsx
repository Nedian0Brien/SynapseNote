// the top of a page as morrow's PageView draws it: icon, the add icon and add cover buttons, title, tags, and a
// database row's properties
import { ImageIcon, Smile } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { findDatabaseOf } from '../vendor/morrow/src/core/database';
import type { PageMeta } from '../vendor/morrow/src/core/model';
import { CoverPicker } from '../vendor/morrow/src/app/components/Cover';
import { Emoji } from '../vendor/morrow/src/app/components/Emoji';
import { RowProperties } from '../vendor/morrow/src/app/components/database/RowProperties';
import { run, useWorkspace } from '../vendor/morrow/src/app/workspace';
import { post } from './bridge';
import { PageTags } from './PageTags';

// the page title, renamed as it is typed like morrow's TitleField in src/app/components/PageView.tsx
function TitleField({ page, readOnly, onEnter }: { page: PageMeta; readOnly: boolean; onEnter: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${element.scrollHeight}px`;
  });
  return (
    <textarea
      ref={ref}
      className="page-title"
      rows={1}
      placeholder="Untitled"
      aria-label="Page title"
      value={page.title}
      readOnly={readOnly}
      spellCheck
      onChange={(event) => run({ type: 'page.rename', id: page.id, title: event.target.value, now: Date.now() })}
      onKeyDown={(event) => {
        const target = event.currentTarget;
        const atEnd = target.selectionStart === target.value.length && target.selectionEnd === target.value.length;
        // enter while composing a korean syllable finishes the syllable, it does not leave the title
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter' || (event.key === 'ArrowDown' && atEnd)) {
          event.preventDefault();
          onEnter();
        }
      }}
    />
  );
}

export function PageHeader({
  page,
  editable,
  onEnter,
}: {
  page: PageMeta;
  editable: boolean;
  // enter or arrow down at the end of the title, to move into the page below it
  onEnter: () => void;
}) {
  const state = useWorkspace();
  const database = findDatabaseOf(state, page);
  const chooseIcon = () => post({ type: 'chooseIcon', pageId: page.id });
  const [coverPicker, setCoverPicker] = useState<HTMLElement | null>(null);
  return (
    <>
      {page.icon && (
        <div className="page-icon-row">
          <button type="button" className="page-icon" aria-label="Change icon" disabled={!editable} onClick={chooseIcon}>
            <Emoji emoji={page.icon} />
          </button>
        </div>
      )}
      {editable && (!page.icon || !page.cover) && (
        <div className="page-header-actions">
          {!page.icon && (
            <button type="button" className="add-icon" onClick={chooseIcon}>
              <Smile size={14} /> Add icon
            </button>
          )}
          {!page.cover && (
            <button type="button" className="add-icon" onClick={(event) => setCoverPicker(event.currentTarget)}>
              <ImageIcon size={14} /> Add cover
            </button>
          )}
        </div>
      )}
      {coverPicker && <CoverPicker page={page} anchor={coverPicker} onClose={() => setCoverPicker(null)} />}
      <h1 className="page-title-heading">
        <TitleField page={page} readOnly={!editable} onEnter={onEnter} />
      </h1>
      {page.kind !== 'database' && <PageTags page={page} editable={editable} />}
      {database?.database && (
        <RowProperties row={page} database={database.database} dbId={database.id} editable={editable} />
      )}
    </>
  );
}

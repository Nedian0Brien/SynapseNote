// the tags property of a page under its title, as morrow's PageTags in src/app/components/TagsView.tsx; that
// module also brings in morrow's sidebar, which the editor bundle leaves out
import { Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { PageMeta } from '../vendor/morrow/src/core/model';
import { tagColor } from '../vendor/morrow/src/core/tags';
import { normalizeTag } from '../vendor/morrow/src/core/vault/frontmatter';
import { run } from '../vendor/morrow/src/app/workspace';
import { navigate } from './host/router';

function setTags(page: PageMeta, tags: string[]): void {
  run({ type: 'page.setTags', id: page.id, tags, now: Date.now() });
}

export function PageTags({ page, editable }: { page: PageMeta; editable: boolean }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  if (page.tags.length === 0 && !editable) return null;
  const save = (tags: string[]) => setTags(page, tags);
  const add = () => {
    const tags = draft
      .split(/[,\s]+/)
      .map((tag) => normalizeTag(tag))
      .filter((tag): tag is string => tag !== null);
    if (tags.length) save([...page.tags, ...tags]);
    setDraft('');
  };
  return (
    <div className="page-tags" aria-label="Tags">
      {page.tags.map((tag) => (
        <span key={tag} className={`tag-chip tag-${tagColor(tag)}`}>
          <button type="button" className="tag-chip-name" onClick={() => navigate({ name: 'tag', tag })}>
            #{tag}
          </button>
          {editable && (
            <button
              type="button"
              className="tag-remove"
              aria-label={`Remove tag ${tag}`}
              onClick={() => save(page.tags.filter((item) => item !== tag))}
            >
              <X size={11} />
            </button>
          )}
        </span>
      ))}
      {editable &&
        (adding ? (
          <input
            ref={inputRef}
            className="tag-input"
            autoFocus
            aria-label="New tag"
            placeholder="tag"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              add();
              setAdding(false);
            }}
            onKeyDown={(event) => {
              // a korean or japanese word still being composed is not finished by enter
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                add();
              } else if (event.key === 'Escape') {
                setDraft('');
                setAdding(false);
              } else if (event.key === 'Backspace' && !draft && page.tags.length) save(page.tags.slice(0, -1));
            }}
          />
        ) : (
          <button type="button" className="add-tag" onClick={() => setAdding(true)}>
            <Plus size={12} /> {page.tags.length ? 'Tag' : 'Add tag'}
          </button>
        ))}
    </div>
  );
}

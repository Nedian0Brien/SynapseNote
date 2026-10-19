// the scrolling frame of a page as morrow's PageView draws it: the cover above, then the page in the writing
// font and width chosen in the settings
import type { ReactNode } from 'react';
import type { PageMeta } from '../vendor/morrow/src/core/model';
import { CoverBanner } from '../vendor/morrow/src/app/components/Cover';
import { usePreferences } from '../vendor/morrow/src/app/platform/preferences';

export function PageFrame({
  page,
  editable,
  children,
}: {
  // null for a page whose header is not shown, such as one that could not be read
  page: PageMeta | null;
  editable: boolean;
  children: ReactNode;
}) {
  const prefs = usePreferences();
  return (
    <div className="page-scroll">
      {page && <CoverBanner page={page} editable={editable} />}
      <article className={`page font-${prefs.font} width-${prefs.width}${page?.cover ? ' has-cover' : ''}`}>
        {children}
      </article>
    </div>
  );
}

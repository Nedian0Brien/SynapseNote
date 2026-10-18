// a database page as morrow's PageView draws one: its header, then the database views in place of the text
import { DatabaseView } from '../vendor/morrow/src/app/components/database/DatabaseView';
import type { PageMeta } from '../vendor/morrow/src/core/model';
import { PageHeader } from './PageHeader';

export function DatabasePage({ page, editable }: { page: PageMeta; editable: boolean }) {
  return (
    <div className="page-scroll">
      <article className="page font-sans width-comfortable">
        <PageHeader page={page} editable={editable} onEnter={() => {}} />
        <DatabaseView page={page} editable={editable} />
      </article>
    </div>
  );
}

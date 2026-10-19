// a database page as morrow's PageView draws one: its header, then the database views in place of the text
import { DatabaseView } from '../vendor/morrow/src/app/components/database/DatabaseView';
import type { PageMeta } from '../vendor/morrow/src/core/model';
import { PageFrame } from './PageFrame';
import { PageHeader } from './PageHeader';

export function DatabasePage({ page, editable }: { page: PageMeta; editable: boolean }) {
  return (
    <PageFrame page={page} editable={editable}>
      <PageHeader page={page} editable={editable} onEnter={() => {}} />
      <DatabaseView page={page} editable={editable} />
    </PageFrame>
  );
}

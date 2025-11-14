import { PersonFilter } from '@/application/database-yjs';
import FieldMenuTitle from '@/components/database/components/filters/filter-menu/FieldMenuTitle';

function PersonFilterMenu({ filter }: { filter: PersonFilter }) {
  return (
    <div className={'flex flex-col'}>
      <FieldMenuTitle fieldId={filter.fieldId} filterId={filter.id} renderConditionSelect={<></>} />
    </div>
  );
}

export default PersonFilterMenu;

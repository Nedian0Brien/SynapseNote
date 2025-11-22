import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useFiltersSelector, useReadOnly } from '@/application/database-yjs';
import { useAddFilter } from '@/application/database-yjs/dispatch';
import { ReactComponent as AddFilterSvg } from '@/assets/icons/plus.svg';
import PropertiesMenu from '@/components/database/components/conditions/PropertiesMenu';
import Filter from '@/components/database/components/filters/Filter';
import { Button } from '@/components/ui/button';

import { useConditionsContext } from '../conditions/context';

export function Filters() {
  const filters = useFiltersSelector();
  const { t } = useTranslation();
  const readOnly = useReadOnly();
  const [openPropertiesMenu, setOpenPropertiesMenu] = useState(false);

  const addFilter = useAddFilter();

  const setOpenFilterId = useConditionsContext()?.setOpenFilterId;

  return (
    <>
      <div className={'flex items-center gap-1'}>
        {filters.map((filter) => (
          <Filter filterId={filter.id} key={filter.id} />
        ))}
      </div>

      {readOnly ? null : (
        <PropertiesMenu
          asChild
          searchPlaceholder={t('grid.settings.filterBy')}
          onSelect={(fieldId) => {
            const filterId = addFilter(fieldId);

            setOpenFilterId?.(filterId);
          }}
          open={openPropertiesMenu}
          onOpenChange={setOpenPropertiesMenu}
        >
          <Button
            variant='ghost'
            className={'mx-1 whitespace-nowrap'}
            size='sm'
            data-testid='database-add-filter-button'
          >
            <AddFilterSvg className={'h-5 w-5'} />
            {t('grid.settings.addFilter')}
          </Button>
        </PropertiesMenu>
      )}
    </>
  );
}

export default Filters;

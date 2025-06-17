import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  useBoardLayoutSettings,
  useDatabaseViewLayout,
  useFiltersSelector,
  useReadOnly,
} from '@/application/database-yjs';
import { useAddFilter } from '@/application/database-yjs/dispatch';
import { DatabaseViewLayout } from '@/application/types';
import { ReactComponent as FilterIcon } from '@/assets/icons/filter.svg';
import PropertiesMenu from '@/components/database/components/conditions/PropertiesMenu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { useConditionsContext } from './context';

function FiltersButton({ toggleExpanded, expanded }: { toggleExpanded?: () => void; expanded?: boolean }) {
  const filters = useFiltersSelector();
  const readOnly = useReadOnly();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const addFilter = useAddFilter();
  const setOpenFilterId = useConditionsContext()?.setOpenFilterId;
  const layout = useDatabaseViewLayout();
  const { fieldId } = useBoardLayoutSettings();

  const filteredOut = useMemo(() => {
    if (layout === DatabaseViewLayout.Board && fieldId) {
      return [fieldId];
    }

    return;
  }, [fieldId, layout]);

  return (
    <PropertiesMenu
      open={open}
      onOpenChange={setOpen}
      searchPlaceholder={t('grid.settings.filterBy')}
      onSelect={(fieldId) => {
        const filterId = addFilter(fieldId);

        setOpenFilterId?.(filterId);
        if (!expanded) {
          toggleExpanded?.();
        }
      }}
      asChild
      filteredOut={filteredOut}
    >
      <div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={'ghost'}
              size={'icon'}
              className={'relative'}
              data-testid={'database-actions-filter'}
              onClick={(e) => {
                e.stopPropagation();
                if (readOnly || filters.length > 0) {
                  toggleExpanded?.();
                } else {
                  setOpen(true);
                }
              }}
              style={{
                color: filters.length > 0 ? 'var(--text-action)' : undefined,
              }}
            >
              <FilterIcon className={'h-5 w-5'} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('grid.settings.filter')}</TooltipContent>
        </Tooltip>
      </div>
    </PropertiesMenu>
  );
}

export default FiltersButton;

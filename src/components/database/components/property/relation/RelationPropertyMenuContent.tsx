
import { useTranslation } from 'react-i18next';

import { useRelationData } from '@/components/database/components/property/relation/useRelationData';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuItemTick,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';

import { RelationView } from './RelationView';

function RelationPropertyMenuContent({ fieldId }: { fieldId: string }) {
  const { t } = useTranslation();
  const { loading, relations, relatedViewId, selectedView, setSelectedView, onUpdateDatabaseId, views } =
    useRelationData(fieldId);

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>{t('grid.relation.relatedDatabasePlaceLabel')}</DropdownMenuLabel>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {loading ? (
              <Progress variant={'primary'} />
            ) : selectedView ? (
              <RelationView view={selectedView} />
            ) : (
              t('grid.relation.relatedDatabasePlaceholder')
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className={'appflowy-scroller max-h-[450px] max-w-[240px] overflow-y-auto'}>
              {views.map((view) => (
                <DropdownMenuItem
                  key={view.view_id}
                  onSelect={() => {
                    setSelectedView(view);
                    const databaseId = Object.entries(relations || []).find(([, id]) => id === view.view_id)?.[0];

                    if (databaseId) {
                      onUpdateDatabaseId(databaseId);
                    }
                  }}
                >
                  <RelationView view={view} />

                  {view.view_id === relatedViewId && <DropdownMenuItemTick />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      </DropdownMenuGroup>
    </>
  );
}

export default RelationPropertyMenuContent;

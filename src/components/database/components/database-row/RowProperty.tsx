import { useTranslation } from 'react-i18next';

import { useReadOnly } from '@/application/database-yjs';
import { ReactComponent as DragIcon } from '@/assets/icons/drag.svg';
import RowPropertyPrimitive from '@/components/database/components/database-row/RowPropertyPrimitive';
import DragItem from '@/components/database/components/drag-and-drop/DragItem';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

function RowProperty(props: {
  fieldId: string;
  rowId: string;
  isActive: boolean;
  setActivePropertyId: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const readOnly = useReadOnly();

  const { fieldId, setActivePropertyId } = props;

  if (readOnly) {
    return <RowPropertyPrimitive {...props} />;
  }

  return (
    <DragItem
      dragHandleVisibility={'hover'}
      id={fieldId}
      className={'items-start pb-4 pr-5'}
      dragIcon={
        <Tooltip>
          <TooltipTrigger
            onClick={() => {
              if (readOnly) return;
              setActivePropertyId(fieldId);
            }}
            className={'relative top-2 h-full'}
          >
            <DragIcon className={'h-5 w-5 text-icon-secondary'} />
          </TooltipTrigger>
          <TooltipContent>{t('tooltip.openMenu')}</TooltipContent>
        </Tooltip>
      }
    >
      <RowPropertyPrimitive {...props} />
    </DragItem>
  );
}

export default RowProperty;

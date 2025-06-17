import { useCellSelector, usePrimaryFieldId } from '@/application/database-yjs';
import { Cell } from '@/components/database/components/cell';
import { useTranslation } from 'react-i18next';

function NoDateRow({ rowId }: { rowId: string }) {
  // const navigateToRow = useNavigateToRow();
  const primaryFieldId = usePrimaryFieldId();
  const cell = useCellSelector({
    rowId,
    fieldId: primaryFieldId || '',
  });
  const { t } = useTranslation();

  if (!primaryFieldId || !cell?.data) {
    return <div className={'text-xs text-text-secondary'}>{t('grid.row.titlePlaceholder')}</div>;
  }

  return (
    <div
      // onClick={() => {
      //   navigateToRow?.(rowId);
      // }}
      className={'w-full hover:text-fill-default'}
    >
      <Cell wrap readOnly cell={cell} rowId={rowId} fieldId={primaryFieldId} />
    </div>
  );
}

export default NoDateRow;

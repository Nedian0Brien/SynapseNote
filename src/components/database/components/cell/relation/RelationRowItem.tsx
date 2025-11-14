import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

function RelationRowItem ({ rowId, content }: {
  rowId: string,
  content: string;
}) {
  const { t } = useTranslation();

  return (
    <div
      data-row-id={rowId}
      style={{
        scrollMarginTop: '80px',
      }}
      className={cn('text-sm w-full text-text-primary', !content && 'text-text-secondary')}
    >
      {content || t('menuAppHeader.defaultNewPageName')}
    </div>
  );
}

export default RelationRowItem;
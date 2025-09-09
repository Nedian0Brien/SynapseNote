import { CustomIconPopover } from '@/components/_shared/cutsom-icon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useEventIcon } from '../hooks/useEventIcon';

interface EventIconButtonProps {
  rowId: string;
  readOnly?: boolean;
  className?: string;
  iconSize?: number;
}

export function EventIconButton({ rowId, readOnly = false, iconSize, className }: EventIconButtonProps) {
  const { showIcon, isFlag, onSelectIcon, removeIcon, renderIcon } = useEventIcon(rowId);

  if (!showIcon) return null;

  return (
    <CustomIconPopover
      defaultActiveTab={'emoji'}
      tabs={['emoji']}
      onSelectIcon={(icon) => {
        onSelectIcon(icon.value);
      }}
      removeIcon={removeIcon}
      enable={Boolean(!readOnly && showIcon)}
    >
      <Button
        className={cn('custom-icon h-4 w-4 flex-shrink-0 !rounded-100 p-0 disabled:text-icon-primary', className)}
        variant={'ghost'}
        disabled={readOnly}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={cn('flex h-full w-full items-center justify-center', isFlag && 'icon')}>
          {renderIcon(iconSize)}
        </div>
      </Button>
    </CustomIconPopover>
  );
}

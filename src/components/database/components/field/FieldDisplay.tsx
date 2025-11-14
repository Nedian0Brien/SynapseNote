import React from 'react';

import { useFieldSelector } from '@/application/database-yjs';
import { FieldId, YjsDatabaseKey } from '@/application/types';
import FieldCustomIcon from '@/components/database/components/field/FieldCustomIcon';
import { cn } from '@/lib/utils';

export function FieldDisplay({
  fieldId,
  showPropertyName = true,
  ...props
}: { fieldId: FieldId; showPropertyName?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  const { field } = useFieldSelector(fieldId);
  const name = field?.get(YjsDatabaseKey.name);

  if (!field) return null;

  return (
    <div {...props} className={cn('flex items-center gap-[10px]', props.className)}>
      <FieldCustomIcon fieldId={fieldId} />
      {showPropertyName && <div className={'flex-1 truncate'}>{name}</div>}
    </div>
  );
}

export default FieldDisplay;

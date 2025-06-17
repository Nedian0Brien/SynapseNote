import { useCellSelector } from '@/application/database-yjs';
import { TextCell } from '@/application/database-yjs/cell.type';
import { TextProperty } from '@/components/database/components/property/text';

function EventPaperTitle ({ fieldId, rowId }: { fieldId: string; rowId: string }) {
  const cell = useCellSelector({
    fieldId,
    rowId,
  });

  return <TextProperty
    wrap
    cell={cell as TextCell}
    fieldId={fieldId}
    rowId={rowId}
  />;
}

export default EventPaperTitle;

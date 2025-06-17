import { FileMediaCellDataItem } from '@/application/database-yjs/cell.type';
import { useMemo } from 'react';

function PreviewImage({ file, onClick }: { file: FileMediaCellDataItem; onClick: () => void }) {
  const thumb = useMemo(() => {
    const url = new URL(file.url);

    url.searchParams.set('auto', 'format');
    url.searchParams.set('fit', 'crop');

    return url.toString() + '&w=240&q=80';
  }, [file.url]);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={'cursor-zoom-in'}
    >
      <img
        src={thumb}
        alt={file.name}
        className={
          'aspect-square h-[28px] w-[28px] min-w-[28px] overflow-hidden rounded-[4px] border border-border-primary object-cover'
        }
      />
    </div>
  );
}

export default PreviewImage;

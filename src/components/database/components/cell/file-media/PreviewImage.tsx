import { useMemo } from 'react';
import isURL from 'validator/lib/isURL';

import { useDatabaseContext } from '@/application/database-yjs';
import { FileMediaCellDataItem } from '@/application/database-yjs/cell.type';
import { getFileLegacyUrl } from '@/utils/file-storage-url';

function PreviewImage({ file, onClick }: { file: FileMediaCellDataItem; onClick: () => void }) {
  const { workspaceId } = useDatabaseContext();

  const thumb = useMemo(() => {
    let fileUrl = file.url;

    if (!fileUrl) return '';
    if (!isURL(fileUrl)) {
      fileUrl = getFileLegacyUrl(workspaceId, file.url);
    }

    const url = new URL(fileUrl);

    url.searchParams.set('auto', 'format');
    url.searchParams.set('fit', 'crop');

    return url.toString() + '&w=240&q=80';
  }, [file.url, workspaceId]);

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

import { useMemo } from 'react';
import isURL from 'validator/lib/isURL';

import { useDatabaseContext } from '@/application/database-yjs';
import { FileMediaCellDataItem } from '@/application/database-yjs/cell.type';
import { getConfigValue } from '@/utils/runtime-config';

function PreviewImage({ file, onClick }: { file: FileMediaCellDataItem; onClick: () => void }) {
  const { workspaceId } = useDatabaseContext();

  const thumb = useMemo(() => {
    let fileUrl = file.url;

    if (!isURL(file.url)) {
      fileUrl = getConfigValue('AF_BASE_URL', '') + '/api/file_storage/' + workspaceId + '/v1/blob/' + file.url;
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

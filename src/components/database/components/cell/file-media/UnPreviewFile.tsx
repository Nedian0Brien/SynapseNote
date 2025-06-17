
import { FileMediaCellDataItem } from '@/application/database-yjs/cell.type';
import FileIcon from '@/components/database/components/cell/file-media/FileIcon';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { openUrl } from '@/utils/url';

function UnPreviewFile ({ file }: { file: FileMediaCellDataItem }) {
  return (
    <Tooltip
      delayDuration={500}
      disableHoverableContent
    >
      <TooltipTrigger asChild>
        <Button
          size={'icon'}
          variant={'ghost'}
          className={'rounded-[4px] text-icon-secondary bg-fill-content-hover cursor-pointer'}
          onClick={e => {
            e.stopPropagation();
            void openUrl(file.url, '_blank');
          }}
        >
          <FileIcon fileType={file.file_type} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side={'bottom'}>
        <div className={'flex gap-1.5'}>
          <span className={'min-w-5 w-5 h-5'}>
            <FileIcon fileType={file.file_type} />
          </span>

          {file.name}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export default UnPreviewFile;

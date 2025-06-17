import { YjsEditor } from '@/application/slate-yjs';
import { ReactComponent as ImageIcon } from '@/assets/icons/video.svg';
import { VideoBlockNode } from '@/components/editor/editor.type';
import { useTranslation } from 'react-i18next';
import { Element } from 'slate';
import { useReadOnly, useSlateStatic } from 'slate-react';

function VideoEmpty({ node, error }: { node: VideoBlockNode; error?: string }) {
  const { t } = useTranslation();
  const editor = useSlateStatic() as YjsEditor;

  const readOnly = useReadOnly() || editor.isElementReadOnly(node as unknown as Element);

  return (
    <>
      <div
        className={`flex w-full select-none items-center gap-4 ${readOnly ? 'cursor-not-allowed' : 'cursor-pointer'} ${
          error ? 'text-function-error' : 'text-text-secondary'
        }`}
      >
        <ImageIcon className={'h-6 w-6'} />
        {error || t('embedAVideo')}
      </div>
    </>
  );
}

export default VideoEmpty;

import emptyImageSrc from '@/assets/images/empty.png';
import { EditorElementProps, LinkPreviewNode } from '@/components/editor/editor.type';
import axios from 'axios';
import { forwardRef, memo, useEffect, useState } from 'react';
import { useReadOnly } from 'slate-react';

export const LinkPreview = memo(
  forwardRef<HTMLDivElement, EditorElementProps<LinkPreviewNode>>(({ node, children, ...attributes }, ref) => {
    const [data, setData] = useState<{
      image?: { url: string };
      title: string;
      description: string;
    } | null>(null);
    const [notFound, setNotFound] = useState<boolean>(false);
    const url = node.data.url;

    useEffect(() => {
      if (!url) return;

      setData(null);
      void (async () => {
        try {
          setNotFound(false);
          const response = await axios.get(`https://api.microlink.io/?url=${url}`);

          if (response.data.statusCode !== 200) {
            setNotFound(true);
            return;
          }

          const data = response.data.data;

          setData(data);
        } catch (_) {
          setNotFound(true);
        }
      })();
    }, [url]);
    const readOnly = useReadOnly();

    return (
      <div
        onClick={() => {
          window.open(url, '_blank');
        }}
        contentEditable={readOnly ? false : undefined}
        {...attributes}
        ref={ref}
        className={`link-preview-block relative w-full cursor-pointer`}
      >
        <div className={'embed-block items-center p-4'} contentEditable={false}>
          {notFound ? (
            <div className={'flex w-full items-center'}>
              <div
                className={
                  'mr-2 flex h-[80px] w-[120px] min-w-[80px] items-center justify-center rounded border text-text-primary'
                }
              >
                <img src={emptyImageSrc} alt={'Empty state'} className={'h-full object-cover object-center'} />
              </div>
              <div className={'flex flex-1 flex-col'}>
                <div className={'text-function-error'}>The link cannot be previewed. Click to open in a new tab.</div>
                <div className={'text-sm text-text-secondary'}>{url}</div>
              </div>
            </div>
          ) : (
            <>
              <img
                src={data?.image?.url}
                alt={''}
                className={'container max-h-[80px] max-w-[120px] rounded bg-cover bg-center max-sm:w-[25%]'}
              />
              <div className={'flex flex-1 flex-col justify-center gap-2 overflow-hidden'}>
                <div className={'max-h-[48px] overflow-hidden truncate text-base font-bold text-text-primary'}>
                  {data?.title}
                </div>
                <div className={'max-h-[64px] overflow-hidden truncate text-sm text-text-primary'}>
                  {data?.description}
                </div>
                <div className={'truncate whitespace-nowrap text-xs text-text-secondary'}>{url}</div>
              </div>
            </>
          )}
        </div>
        <div ref={ref} className={'absolute left-0 top-0 h-full w-full caret-transparent'}>
          {children}
        </div>
      </div>
    );
  }),
  (prev, next) => prev.node.data.url === next.node.data.url
);
export default LinkPreview;

import LoadingDots from '@/components/chat/components/ui/loading-dots';
import { toast } from 'sonner';
import { useTranslation } from '@/components/chat/i18n';
import { searchViews } from '@/components/chat/lib/views';
import { Spaces } from './spaces';
import { MESSAGE_VARIANTS } from '@/components/chat/lib/animations';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchInput } from '@/components/chat/components/ui/search-input';
import { Separator } from '@/components/ui/separator';
import { useCheckboxTree } from '@/components/chat/hooks/use-checkbox-tree';
import { View } from '@/components/chat/types';
import { useWriterContext } from '@/components/chat/writer/context';
import { ReactComponent as ChevronDown } from '@/assets/icons/triangle_down.svg';
import { ReactComponent as DocIcon } from '@/assets/icons/page.svg';
import { useEffect, useMemo, useState } from 'react';

export function ViewTree() {
  const [searchValue, setSearchValue] = useState('');
  const { viewId, setRagIds } = useWriterContext();
  const { fetchViews } = useWriterContext();
  const [viewsLoading, setViewsLoading] = useState(true);
  const [folder, setFolder] = useState<View | null>(null);
  const viewIds = useMemo(() => [viewId], [viewId]);

  const { t } = useTranslation();

  useEffect(() => {
    void (async () => {
      setViewsLoading(true);
      try {
        const data = await fetchViews();

        if (!data) return;
        setFolder(data);
        // eslint-disable-next-line
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setViewsLoading(false);
      }
    })();
  }, [fetchViews]);

  const views = useMemo(() => {
    return folder?.children || [];
  }, [folder]);

  const { getSelected, getCheckStatus, toggleNode, getInitialExpand } = useCheckboxTree(viewIds, views);

  const length = getSelected().length;

  const spaces = useMemo(() => {
    const spaces = folder?.children.filter((view) => view.extra?.is_space);

    return searchViews(spaces || [], searchValue);
  }, [folder, searchValue]);

  const [open, setOpen] = useState(false);

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          className={'h-[28px] !gap-1 text-xs !text-text-secondary'}
          size={'sm'}
          variant={'ghost'}
          disabled={viewsLoading}
        >
          <DocIcon className='h-5 w-5'/>
          <div className={'flex flex-1 items-center gap-0.5'}>
            {length > 1 ? length : t('writer.current-page')}
            {viewsLoading ? <LoadingDots size={12} /> : <ChevronDown className='w-3 h-5' />}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent side={'top'} asChild>
        <motion.div
          variants={MESSAGE_VARIANTS.getSelectorVariants()}
          initial='hidden'
          animate={open ? 'visible' : 'exit'}
          className={
            'flex h-fit max-h-[360px] min-h-[200px] w-[300px] flex-col gap-2 rounded-md border border-border bg-popover px-1 py-1 shadow-md'
          }
        >
          <SearchInput value={searchValue} onChange={setSearchValue} />
          <Separator />
          <div className={'appflowy-scrollbar flex-1 overflow-y-auto overflow-x-hidden'}>
            <Spaces
              viewsLoading={viewsLoading}
              spaces={spaces}
              getCheckStatus={getCheckStatus}
              getInitialExpand={getInitialExpand}
              onToggle={(view: View) => {
                if (view.view_id === viewId) return;
                const ids = toggleNode(view);

                setRagIds(Array.from(ids));
              }}
            />
          </div>
        </motion.div>
      </PopoverContent>
    </Popover>
  );
}

import { AddMessageToPageWrapper } from '@/components/chat/components/add-messages-to-page-wrapper';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ReactComponent as AddPageIcon } from '@/assets/icons/add_to_page.svg';
import { useTranslation } from '@/components/chat/i18n';
import { useChatMessagesContext } from '@/components/chat/provider/messages-provider';

export function AddMessageTo({ id }: { id: number }) {
  const { getMessage } = useChatMessagesContext();

  const message = getMessage(id);
  const { t } = useTranslation();

  if (!message) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <AddMessageToPageWrapper messages={[message]}>
          <Button
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            variant={'ghost'}
            size={'icon'}
          >
            <AddPageIcon className='h-5 w-5' />
          </Button>
        </AddMessageToPageWrapper>
      </TooltipTrigger>
      <TooltipContent align={'center'} side={'bottom'}>
        {t('button.addToPage')}
      </TooltipContent>
    </Tooltip>
  );
}

export default AddMessageTo;

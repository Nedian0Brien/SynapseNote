import { AddMessageToPageWrapper } from '@/components/chat/components/add-messages-to-page-wrapper';
import { Button } from '@/components/chat/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/chat/components/ui/tooltip';
import { ReactComponent as AddPageIcon } from '@/components/chat/assets/icons/doc-forward.svg';
import { useTranslation } from '@/components/chat/i18n';
import { useChatMessagesContext } from '@/components/chat/provider/messages-provider';

export function AddMessageTo({ id }: {
  id: number
}) {
  const {
    getMessage,
  } = useChatMessagesContext();

  const message = getMessage(id);
  const {
    t,
  } = useTranslation();

  if(!message) return null;

  return (
    <Tooltip>
      <AddMessageToPageWrapper messages={[message]}>
        <TooltipTrigger asChild>
          <Button
            onMouseDown={e => {
              e.preventDefault();
            }}
            variant={'ghost'}
            size={'icon'}
            className={`h-7 !p-0 w-7`}
          >
            <AddPageIcon
              style={{
                width: 16,
                height: 16,
              }}
            />
          </Button>
        </TooltipTrigger>
      </AddMessageToPageWrapper>
      <TooltipContent
        align={'center'}
        side={'bottom'}
      >
        {t('button.addToPage')}
      </TooltipContent>
    </Tooltip>
  );
}

export default AddMessageTo;
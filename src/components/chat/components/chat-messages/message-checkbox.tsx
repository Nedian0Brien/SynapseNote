import { useChatContext } from '@/components/chat/chat/context';
import { Button } from '@/components/chat/components/ui/button';
import { useChatMessagesContext } from '@/components/chat/provider/messages-provider';
import { useSelectionModeContext } from '@/components/chat/provider/selection-mode-provider';
import { useMemo } from 'react';
import { CheckSquare, Square } from 'lucide-react';

function MessageCheckbox({ id }: {
  id: number
}) {
  const {
    toggleMessage,
    messages,
  } = useSelectionModeContext();
  const {
    selectionMode,
  } = useChatContext();
  const {
    getMessage,
  } = useChatMessagesContext();
  const selected = useMemo(() => messages.find(message => {
    return message.message_id === id;
  }), [id, messages]);

  if(!selectionMode) return null;

  return (
    <Button
      onClick={() => {
        const message = getMessage(id);
        if(!message) return;

        toggleMessage?.(message);
      }}
      className={'w-4 h-4 ml-2 p-3'}
      variant={'link'}
    >
      {selected ? <CheckSquare
        className={'text-primary'}
        size={16}
      /> : <Square
        className={' text-accent-foreground'}
        size={16}
      />}
    </Button>
  );
}

export default MessageCheckbox;
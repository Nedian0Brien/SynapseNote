import Main from './main';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatProps } from '@/components/chat/types';

export * from '@/components/chat/provider/prompt-modal-provider';
export * from '@/components/chat/provider/view-loader-provider';

export function Chat(props: ChatProps) {
  return (
    <div id={'appflowy-chat'} className={'h-full w-full overflow-hidden'}>
      <TooltipProvider>
        <Main {...props} />
      </TooltipProvider>
    </div>
  );
}

export default Chat;

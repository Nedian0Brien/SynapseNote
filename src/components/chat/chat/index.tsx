import Main from './main';
import { TooltipProvider } from '@/components/chat/components/ui/tooltip';
import { ChatProps } from '@/components/chat/types';
import { Toaster } from '@/components/chat/components/ui/toaster';

export * from '@/components/chat/provider/prompt-modal-provider';
export * from '@/components/chat/provider/view-loader-provider';

export function Chat(props: ChatProps) {
  return (
    <div id={'appflowy-chat'} className={'w-full h-full overflow-hidden'}>
      <TooltipProvider>
        <Main {...props} />
      </TooltipProvider>
      <Toaster />
    </div>
  );
}

export default Chat;

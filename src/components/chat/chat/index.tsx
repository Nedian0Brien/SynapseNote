import Main from './main';
import { TooltipProvider } from '@/components/chat/components/ui/tooltip';
import { ChatI18nContext, getI18n, initI18n } from '@/components/chat/i18n/config';
import { ChatProps } from '@/components/chat/types';
import { Toaster } from '@/components/chat/components/ui/toaster';
import '@/components/chat/styles/index.scss';

export * from '@/components/chat/provider/prompt-modal-provider';
export * from '@/components/chat/provider/view-loader-provider';

initI18n();
const i18n = getI18n();

export function Chat(props: ChatProps) {
  return (
    <div id={'appflowy-chat'} className={'w-full h-full overflow-hidden'}>
      <ChatI18nContext.Provider value={i18n}>
        <TooltipProvider>
          <Main {...props} />
        </TooltipProvider>
        <Toaster />
      </ChatI18nContext.Provider>
    </div>
  );
}

export default Chat;

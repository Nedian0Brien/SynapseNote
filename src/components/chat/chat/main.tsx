// Code: Chat main component
import { ChatInput } from '@/components/chat/components/chat-input';
import { ChatMessages } from '@/components/chat/components/chat-messages';
import { ModelSelectorContext } from '@/components/chat/contexts/model-selector-context';
import { cn } from '@/components/chat/lib/utils';
import { EditorProvider } from '@/components/chat/provider/editor-provider';
import { MessageAnimationProvider } from '@/components/chat/provider/message-animation-provider';
import { MessagesHandlerProvider, useMessagesHandlerContext } from '@/components/chat/provider/messages-handler-provider';
import { ChatMessagesProvider } from '@/components/chat/provider/messages-provider';
import { PromptModalProvider } from '@/components/chat/provider/prompt-modal-provider';
import { ResponseFormatProvider } from '@/components/chat/provider/response-format-provider';
import { SelectionModeProvider } from '@/components/chat/provider/selection-mode-provider';
import { SuggestionsProvider } from '@/components/chat/provider/suggestions-provider';
import { ViewLoaderProvider } from '@/components/chat/provider/view-loader-provider';
import { ChatProps, User } from '@/components/chat/types';
import { AnimatePresence, motion } from 'framer-motion';
import { ChatContext, useChatContext } from './context';

// Component to bridge ModelSelector with MessagesHandler
function ChatContentWithModelSync({ currentUser, selectionMode }: { currentUser?: User; selectionMode?: boolean }) {
  const { selectedModelName, setSelectedModelName } = useMessagesHandlerContext();
  const { requestInstance, chatId } = useChatContext();

  return (
    <ModelSelectorContext.Provider
      value={{
        selectedModelName,
        setSelectedModelName,
        requestInstance: {
          getModelList: () => requestInstance.getModelList(),
          getCurrentModel: async () => {
            const settings = await requestInstance.getChatSettings();

            return settings.metadata?.ai_model as string | undefined || '';
          },
          setCurrentModel: async (modelName: string) => {
            await requestInstance.updateChatSettings({
              metadata: {
                ai_model: modelName
              }
            });
          },
        },
        chatId,
      }}
    >
      <div className={'w-full relative h-full flex flex-col'}>
        <ChatMessages currentUser={currentUser} />
        <motion.div
          layout
          className={cn(
            'w-full relative flex pb-6 justify-center max-sm:hidden',
          )}
        >
          <AnimatePresence mode='wait'>
            {!selectionMode && <ChatInput />}
          </AnimatePresence>
        </motion.div>
      </div>
    </ModelSelectorContext.Provider>
  );
}

function Main(props: ChatProps) {
  const { currentUser, selectionMode } = props;

  return (
    <ChatContext.Provider value={props}>
      <ChatMessagesProvider>
        <MessageAnimationProvider>
          <SuggestionsProvider>
            <EditorProvider>
              <ViewLoaderProvider
                getView={(viewId: string, forceRefresh?: boolean) =>
                  props.requestInstance.getView(viewId, forceRefresh)
                }
                fetchViews={(forceRefresh?: boolean) =>
                  props.requestInstance.fetchViews(forceRefresh)
                }
              >
                <SelectionModeProvider>
                  <ResponseFormatProvider>
                    <PromptModalProvider
                      workspaceId={props.workspaceId}
                      loadDatabasePrompts={props.loadDatabasePrompts}
                      testDatabasePromptConfig={props.testDatabasePromptConfig}
                    >
                      <MessagesHandlerProvider>
                        <ChatContentWithModelSync currentUser={currentUser} selectionMode={selectionMode} />
                      </MessagesHandlerProvider>
                    </PromptModalProvider>
                  </ResponseFormatProvider>
                </SelectionModeProvider>
              </ViewLoaderProvider>
            </EditorProvider>
          </SuggestionsProvider>
        </MessageAnimationProvider>
      </ChatMessagesProvider>
    </ChatContext.Provider>
  );
}

export default Main;

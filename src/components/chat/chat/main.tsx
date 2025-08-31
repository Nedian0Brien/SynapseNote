// Code: Chat main component
import { ChatContext } from './context';
import { ChatInput } from '@/components/chat/components/chat-input';
import { ChatMessages } from '@/components/chat/components/chat-messages';
import { cn } from '@/components/chat/lib/utils';
import { MessageAnimationProvider } from '@/components/chat/provider/message-animation-provider';
import { EditorProvider } from '@/components/chat/provider/editor-provider';
import { MessagesHandlerProvider } from '@/components/chat/provider/messages-handler-provider';
import { ChatMessagesProvider } from '@/components/chat/provider/messages-provider';
import { PromptModalProvider } from '@/components/chat/provider/prompt-modal-provider';
import { ResponseFormatProvider } from '@/components/chat/provider/response-format-provider';
import { SelectionModeProvider } from '@/components/chat/provider/selection-mode-provider';
import { SuggestionsProvider } from '@/components/chat/provider/suggestions-provider';
import { ChatProps } from '@/components/chat/types';
import { AnimatePresence, motion } from 'framer-motion';
import { ViewLoaderProvider } from '@/components/chat/provider/view-loader-provider';
import { ModelSelectorContext } from '@/components/chat/contexts/model-selector-context';

function Main(props: ChatProps) {
  const { currentUser, selectionMode } = props;

  return (
    <ChatContext.Provider value={props}>
      <ModelSelectorContext.Provider
        value={{
          requestInstance: {
            getModelList: () => props.requestInstance.getModelList(),
            getCurrentModel: async () => {
              const settings = await props.requestInstance.getChatSettings();

              return settings.metadata?.ai_model as string | undefined || '';
            },
            setCurrentModel: async (modelName: string) => {
              await props.requestInstance.updateChatSettings({
                metadata: {
                  ai_model: modelName
                }
              });
            },
          },
          chatId: props.chatId,
        }}
      >
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
                      </MessagesHandlerProvider>
                    </PromptModalProvider>
                  </ResponseFormatProvider>
                </SelectionModeProvider>
              </ViewLoaderProvider>
            </EditorProvider>
          </SuggestionsProvider>
        </MessageAnimationProvider>
      </ChatMessagesProvider>
      </ModelSelectorContext.Provider>
    </ChatContext.Provider>
  );
}

export default Main;

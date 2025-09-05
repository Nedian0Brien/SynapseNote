import { AnswerMd } from '../chat-messages/answer-md';
import { MessageActions } from '../chat-messages/message-actions';
import MessageSources from '../chat-messages/message-sources';
import { MessageSuggestions } from '../chat-messages/message-suggestions';
import LoadingDots from '@/components/chat/components/ui/loading-dots';
import { useTranslation } from '@/components/chat/i18n';
import { useMessagesHandlerContext } from '@/components/chat/provider/messages-handler-provider';
import { useChatMessagesContext } from '@/components/chat/provider/messages-provider';
import { useResponseFormatContext } from '@/components/chat/provider/response-format-provider';
import { useSuggestionsContext } from '@/components/chat/provider/suggestions-provider';
import { ChatInputMode } from '@/components/chat/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EditorProvider } from '@appflowyinc/editor';
import { ReactComponent as Error } from '@/assets/icons/error.svg';
import MessageCheckbox from './message-checkbox';

export function AssistantMessage({ id, isHovered }: { id: number; isHovered: boolean }) {
  const isInitialLoad = useRef(true);
  const { getMessage } = useChatMessagesContext();
  const { responseFormat, responseMode } = useResponseFormatContext();
  const { fetchAnswerStream } = useMessagesHandlerContext();

  const { getMessageSuggestions } = useSuggestionsContext();

  const message = getMessage(id);

  const questionId = id - 1;
  const sources = message?.meta_data;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<boolean>(false);
  const [content, setContent] = useState<string>('');
  const [done, setDone] = useState<boolean>(false);

  const { t } = useTranslation();

  useEffect(() => {
    if (!questionId || !isInitialLoad.current || loading) return;
    void (async () => {
      setLoading(true);

      try {
        isInitialLoad.current = false;
        await fetchAnswerStream(
          questionId,
          responseMode === ChatInputMode.FormatResponse
            ? {
                output_content: responseFormat.output_content,
                output_layout: responseFormat.output_layout,
              }
            : undefined,
          (text, done) => {
            if (done || text) {
              setLoading(false);
            }

            setDone(done || false);
            setContent(text);
          }
        );
        // eslint-disable-next-line
      } catch (e: any) {
        console.error(e);
        setError(true);
        setLoading(false);
      }
    })();
  }, [fetchAnswerStream, questionId, responseFormat, responseMode, loading]);

  const suggestions = useMemo(() => {
    if (!questionId) return null;
    return getMessageSuggestions(questionId);
  }, [questionId, getMessageSuggestions]);

  return (
    <div className={'assistant-message relative flex w-full transform flex-col gap-1 transition-transform'}>
      {error ? (
        <div className={`flex w-full items-center justify-center`}>
          <div className='max-w-[480px]'>
            <Alert className={'border-none bg-fill-error-light text-foreground'}>
              <AlertDescription>
                <div className='flex items-center gap-3'>
                  <div className={'!h-4 !min-h-4 !w-4 !min-w-4'}>
                    <Error />
                  </div>
                  {t('errors.noLimit')}
                </div>
              </AlertDescription>
            </Alert>
          </div>
        </div>
      ) : loading ? (
        <div className={`flex items-center gap-2 overflow-hidden pl-0.5`}>
          <span className={'text-sm text-foreground opacity-60'}>{t('generating')}</span>
          <LoadingDots />
        </div>
      ) : (
        content && (
          <div className={'flex w-full gap-2 overflow-hidden py-1 pl-0.5'}>
            <MessageCheckbox id={id} />
            <EditorProvider>
              <AnswerMd id={id} mdContent={content} />
            </EditorProvider>
          </div>
        )
      )}
      {sources && sources.length > 0 ? <MessageSources sources={sources} /> : null}
      {done && <MessageActions id={id} isHovered={isHovered} />}
      {suggestions && suggestions.items.length > 0 ? <MessageSuggestions suggestions={suggestions} /> : null}
    </div>
  );
}

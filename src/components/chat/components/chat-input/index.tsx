import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ReactComponent as SendIcon } from '@/components/chat/assets/icons/arrow-up.svg';
import { ReactComponent as AutoTextIcon } from '@/components/chat/assets/icons/auto-text.svg';
import { ReactComponent as ImageTextIcon } from '@/components/chat/assets/icons/image-text.svg';
import { ReactComponent as StopIcon } from '@/components/chat/assets/icons/stop.svg';
import { useChatContext } from '@/components/chat/chat/context';
import { toast } from '@/components/chat/hooks/use-toast';
import { useTranslation } from '@/components/chat/i18n';
import { MESSAGE_VARIANTS } from '@/components/chat/lib/animations';
import { useMessagesHandlerContext } from '@/components/chat/provider/messages-handler-provider';
import { usePromptModal } from '@/components/chat/provider/prompt-modal-provider';
import { useResponseFormatContext } from '@/components/chat/provider/response-format-provider';
import { ChatInputMode } from '@/components/chat/types';
import { AiPrompt } from '@/components/chat/types/prompt';
import { Button } from '@/components/chat/components/ui/button';
import { FormatGroup } from '@/components/chat/components/ui/format-group';
import LoadingDots from '@/components/chat/components/ui/loading-dots';
import { Textarea } from '@/components/chat/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/chat/components/ui/tooltip';
import { ModelSelector } from './model-selector';
import { PromptModal } from './prompt-modal';
import { RelatedViews } from './related-views';

const MAX_HEIGHT = 200;

export function ChatInput() {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const [message, setMessage] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    submitQuestion,
    cancelAnswerStream,
    answerApplying,
    questionSending,
  } = useMessagesHandlerContext();
  const { responseFormat, responseMode, setResponseFormat, setResponseMode } =
    useResponseFormatContext();
  const {
    openModal,
    currentPromptId,
    updateCurrentPromptId,
    reloadDatabasePrompts,
  } = usePromptModal();

  const { chatId } = useChatContext();

  const disabled = questionSending;

  useEffect(() => {
    return () => {
      setMessage('');
    };
  }, [chatId]);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // reset height
    textarea.style.height = 'auto';

    // calculate height
    const newHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT);
    textarea.style.height = `${newHeight}px`;

    // toggle overflowY
    textarea.style.overflowY =
      textarea.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';

    // adjust container height
    if (containerRef.current) {
      containerRef.current.style.height = `${newHeight + (responseMode === ChatInputMode.FormatResponse ? 54 + 20 : 30 + 16)}px`; // 32px padding
    }
  }, [responseMode]);

  const handleInput = () => {
    adjustHeight();
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    adjustHeight();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast({
        variant: 'destructive',
        description: `${t('errors.emptyMessage')}`,
      });
      return;
    }
    if (questionSending || answerApplying) {
      toast({
        variant: 'destructive',
        description: `${t('errors.wait')}`,
      });
      return;
    }
    setMessage('');
    adjustHeight();

    try {
      await submitQuestion(message);
    } catch (e) {
      console.error(e);
    } finally {
      updateCurrentPromptId(null);
    }
  };

  useEffect(() => {
    const handleResize = () => {
      if (message) {
        adjustHeight();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [adjustHeight, message]);

  const formatTooltip =
    responseMode === ChatInputMode.FormatResponse
      ? t('input.button.auto')
      : t('input.button.format');
  const FormatIcon =
    responseMode === ChatInputMode.FormatResponse
      ? AutoTextIcon
      : ImageTextIcon;

  useEffect(() => {
    adjustHeight();
  }, [adjustHeight, currentPromptId, message]);

  const handleUsePrompt = useCallback(
    (prompt: AiPrompt) => {
      updateCurrentPromptId(prompt.id);
      setResponseMode(ChatInputMode.Auto);
      setMessage(prompt.content);
    },
    [setResponseMode, updateCurrentPromptId],
  );

  return (
    <motion.div
      variants={MESSAGE_VARIANTS.getInputVariants()}
      initial='hidden'
      animate='visible'
      exit='hidden'
      className={'w-full'}
    >
      <div
        ref={containerRef}
        className={`border relative justify-between gap-1 flex flex-col ${focused ? 'ring-1 ring-ring border-primary' : 'ring-0'} border-border py-1 px-2 focus:border-primary w-full rounded-[12px]`}
      >
        {responseMode === ChatInputMode.FormatResponse && (
          <FormatGroup
            setOutputLayout={(newOutLayout) => {
              setResponseFormat({
                ...responseFormat,
                output_layout: newOutLayout,
              });
            }}
            setOutputContent={(newOutContent) => {
              setResponseFormat({
                ...responseFormat,
                output_content: newOutContent,
              });
            }}
            outputContent={responseFormat.output_content}
            outputLayout={responseFormat.output_layout}
          />
        )}
        <Textarea
          autoFocus
          value={message}
          onChange={handleChange}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          ref={textareaRef}
          onFocus={() => {
            setFocused(true);
          }}
          placeholder={t('input.placeholder')}
          onBlur={() => {
            setFocused(false);
          }}
          rows={1}
          className={
            'resize-none !text-sm caret-primary min-h-[32px] !py-1 !px-1.5 !border-none !shadow-none w-full !ring-0 h-full !outline-none'
          }
        />

        <div className={'flex justify-between items-center gap-4'}>
          <div className={'flex items-center gap-1'}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  variant={'ghost'}
                  size={'icon'}
                  className={'w-7 h-7'}
                  onClick={() => {
                    setResponseMode(
                      responseMode === ChatInputMode.FormatResponse
                        ? ChatInputMode.Auto
                        : ChatInputMode.FormatResponse,
                    );
                  }}
                >
                  <FormatIcon
                    style={{
                      width: 20,
                      height: 20,
                    }}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent align={'center'} side={'right'}>
                {formatTooltip}
              </TooltipContent>
            </Tooltip>

            <Button
              variant={'ghost'}
              className={'h-7 text-xs'}
            >
              Test Model Button
            </Button>
            
            <ModelSelector 
              className={'h-7'} 
              disabled={questionSending || answerApplying}
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  variant={'ghost'}
                  className={'h-7 text-xs'}
                  onClick={() => {
                    reloadDatabasePrompts();
                    openModal();
                  }}
                >
                  {t('customPrompt.browsePrompts')}
                </Button>
              </TooltipTrigger>
              <TooltipContent align={'center'} side={'right'}>
                {t('customPrompt.browsePrompts')}
              </TooltipContent>
            </Tooltip>

            <PromptModal
              onUsePrompt={handleUsePrompt}
              returnFocus={() => {
                setFocused(true);
                setTimeout(() => {
                  textareaRef.current?.focus();
                }, 200);
              }}
            />
          </div>

          <div className={'flex items-center gap-2'}>
            <RelatedViews />
            {answerApplying ? (
              <Button
                onClick={cancelAnswerStream}
                size={'icon'}
                variant={'link'}
                className={'w-7 h-7 text-fill-theme-thick !p-0.5'}
              >
                <StopIcon
                  style={{
                    width: 24,
                    height: 24,
                  }}
                />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                size={'icon'}
                variant={'link'}
                className={'w-7 h-7 text-fill-theme-thick !p-0.5'}
                disabled={!message.trim() || disabled}
              >
                {questionSending ? (
                  <LoadingDots />
                ) : (
                  <SendIcon
                    style={{
                      width: 24,
                      height: 24,
                    }}
                  />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
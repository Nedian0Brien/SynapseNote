import { ReactComponent as RegenerateCircleIcon } from '@/assets/icons/ai_regenerate.svg';
import { ReactComponent as RegenerateIcon } from '@/assets/icons/regenerate.svg';
import { ReactComponent as ChevronIcon } from '@/assets/icons/triangle_down.svg';
import { ReactComponent as TryAgainIcon } from '@/assets/icons/undo.svg';
import { FormatGroup } from '@/components/chat/components/ui/format-group';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from '@/components/chat/i18n';
import { useMessagesHandlerContext } from '@/components/chat/provider/messages-handler-provider';
import { useChatMessagesContext } from '@/components/chat/provider/messages-provider';
import { useResponseFormatContext } from '@/components/chat/provider/response-format-provider';
import { OutputContent, OutputLayout } from '@/components/chat/types';
import { useCallback, useState } from 'react';

export function Regenerations({ id }: { id: number }) {
  const { t } = useTranslation();
  const { messageIds } = useChatMessagesContext();
  const { setResponseFormat, getMessageResponseFormat } = useResponseFormatContext();

  const { regenerateAnswer } = useMessagesHandlerContext();

  const [outputContent, setOutputContent] = useState<OutputContent | undefined>(
    getMessageResponseFormat(id)?.output_content
  );
  const [outputLayout, setOutputLayout] = useState<OutputLayout | undefined>(
    getMessageResponseFormat(id)?.output_layout
  );

  const regenerate = useCallback(() => {
    const index = messageIds.indexOf(id);

    if (index < 0) {
      return;
    }

    const questionId = id - 1;

    void regenerateAnswer(questionId);
  }, [id, messageIds, regenerateAnswer]);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              void regenerate();
            }}
            variant={'ghost'}
            size={'icon'}
          >
            <TryAgainIcon className='h-5 w-5' />
          </Button>
        </TooltipTrigger>
        <TooltipContent align={'center'} side={'bottom'}>
          {t('button.tryAgain')}
        </TooltipContent>
      </Tooltip>
      <Popover modal>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                variant={'ghost'}
                size={'icon'}
                className={`!w-10 gap-0`}
              >
                <RegenerateIcon className='h-5 w-5' />
                <ChevronIcon className='h-5 w-3 text-icon-tertiary' />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent align={'center'} side={'bottom'}>
            {t('button.changeFormat')}
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className='flex !min-w-[0px] items-center gap-1 p-0.5'
        >
          <FormatGroup
            outputContent={outputContent}
            outputLayout={outputLayout}
            setOutputContent={(content) => {
              setOutputContent(content);
              setOutputLayout(OutputLayout.Paragraph);
            }}
            setOutputLayout={setOutputLayout}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={'link'}
                size={'icon'}
                disabled={outputContent === undefined || outputLayout === undefined}
                onClick={() => {
                  if (outputContent === undefined || outputLayout === undefined) {
                    return;
                  }

                  setResponseFormat({
                    output_content: outputContent,
                    output_layout: outputLayout,
                  });
                  void regenerate();
                }}
              >
                <RegenerateCircleIcon className='h-5 w-5' />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('button.regenerateWithNewFormat')}</TooltipContent>
          </Tooltip>
        </PopoverContent>
      </Popover>
    </>
  );
}

export default Regenerations;

import { Button } from '@/components/chat/components/ui/button';
import { Separator } from '@/components/chat/components/ui/separator';
import { useTranslation } from '@/components/chat/i18n';
import { ReactComponent as ImproveWritingIcon } from '@/components/chat/assets/icons/improve-writing.svg';
import { ReactComponent as AskAIIcon } from '@/components/chat/assets/icons/ai.svg';
import { ReactComponent as FixSpellingIcon } from '@/components/chat/assets/icons/fix-spelling.svg';
import { ReactComponent as ExplainIcon } from '@/components/chat/assets/icons/explain.svg';
import { ReactComponent as MakeLongerIcon } from '@/components/chat/assets/icons/make-longer.svg';
import { ReactComponent as MakeShorterIcon } from '@/components/chat/assets/icons/make-shorter.svg';
import { ReactComponent as ContinueWritingIcon } from '@/components/chat/assets/icons/continue-writing.svg';
import { AIAssistantType } from '@/components/chat/types';
import { useWriterContext } from '@/components/chat/writer/context';
import { useMemo } from 'react';

export function AiWriterMenuContent({ input, onClicked, isFilterOut }: {
  onClicked: (type: AIAssistantType) => void;
  isFilterOut?: (type: AIAssistantType) => boolean;
  input: string;
}) {
  const { t } = useTranslation();
  const {
    improveWriting,
    askAIAnything,
    fixSpelling,
    explain,
    makeLonger,
    makeShorter,
    continueWriting,
  } = useWriterContext();

  const actions = useMemo(() => [{
    icon: ContinueWritingIcon,
    label: t('writer.continue'),
    key: AIAssistantType.ContinueWriting,
    onClick: () => continueWriting(input),
  }, {
    icon: ImproveWritingIcon,
    label: t('writer.improve'),
    key: AIAssistantType.ImproveWriting,
    onClick: () => improveWriting(input),
  },
    {
      key: AIAssistantType.AskAIAnything,
      icon: AskAIIcon,
      label: t('writer.askAI'),
      onClick: () => askAIAnything(input),
    },
    {
      key: AIAssistantType.FixSpelling,
      icon: FixSpellingIcon,
      label: t('writer.fixSpelling'),
      onClick: () => fixSpelling(input),
    },
    {
      key: AIAssistantType.Explain,
      icon: ExplainIcon,
      label: t('writer.explain'),
      onClick: () => explain(input),
    },
  ].filter(item => {
    return !isFilterOut || !isFilterOut(item.key);
  }), [askAIAnything, continueWriting, explain, fixSpelling, improveWriting, input, isFilterOut, t]);

  const otherActions = useMemo(() => [{
    icon: MakeLongerIcon,
    label: t('writer.makeLonger'),
    onClick: () => makeLonger(input),
    key: AIAssistantType.MakeLonger,
  },
    {
      icon: MakeShorterIcon,
      label: t('writer.makeShorter'),
      onClick: () => makeShorter(input),
      key: AIAssistantType.MakeShorter,
    }].filter(item => {
    return !isFilterOut || !isFilterOut(item.key);
  }), [t, makeLonger, input, makeShorter, isFilterOut]);

  return <div className="flex flex-col gap-1">
    {actions.map((action, index) => (
      <Button
        key={index}
        onClick={() => {
          action.onClick();
          onClicked(action.key);
        }}
        className={'w-full !p-1.5 justify-start !gap-[10px] !text-foreground !font-normal'}
        variant={'ghost'}
        onMouseDown={e => e.preventDefault()}
        startIcon={<action.icon className={'!w-5 !h-5'} />}
      >{action.label}
      </Button>
    ))}
    {otherActions.length > 0 && <Separator />}

    {
      otherActions.map((action, index) => (
        <Button
          onClick={() => {
            void action.onClick();
            onClicked(action.key);
          }}
          key={index}
          className={'w-full !p-1.5 !gap-[10px] justify-start !text-foreground !font-normal'}
          variant={'ghost'}
          startIcon={<action.icon className={'!w-5 !h-5'} />}
          onMouseDown={e => e.preventDefault()}

        >{action.label}
        </Button>
      ))
    }
  </div>;
}
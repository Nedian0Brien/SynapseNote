import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/components/chat/i18n';
import { useMessagesHandlerContext } from '@/components/chat/provider/messages-handler-provider';
import { User } from '@/components/chat/types';
import { ReactComponent as Logo } from '@/components/chat/assets/logo.svg';
import { useCallback } from 'react';

export function EmptyMessages({ currentUser }: {
  currentUser?: User;
}) {
  const { t } = useTranslation();
  const {
    submitQuestion,
  } = useMessagesHandlerContext();

  const handleClick = useCallback(async(content: string) => {
    try {
      await submitQuestion(content);
    } catch(e) {
      console.error(e);
    }
  }, [submitQuestion]);

  return (
    <div className={'w-full h-full justify-center items-center flex flex-col gap-8'}>
      <div className={'flex flex-col gap-6 w-full justify-center items-center'}>
        <Logo className={'h-10 w-10 text-text-secondary'} />
        <Label className={'text-foreground/70'}>{t('placeholder', {
          name: currentUser?.name || t('dear'),
        })}</Label>
      </div>
      <div className={'flex flex-col text-foreground/60 gap-4 w-full justify-center items-center'}>
        <Button
          onClick={() => handleClick(t('questions.one'))}
          variant={'outline'}
          className={'rounded-full py-2 px-4 shadow-sm'}
        >
          {t('questions.one')}
        </Button>
        <Button
          onClick={() => handleClick(t('questions.two'))}
          variant={'outline'}
          className={'rounded-full py-2 px-4 shadow-sm'}
        >
          {t('questions.two')}
        </Button>
        <Button
          onClick={() => handleClick(t('questions.three'))}
          variant={'outline'}
          className={'rounded-full py-2 px-4 shadow-sm'}
        >
          {t('questions.three')}
        </Button>
        <Button
          onClick={() => handleClick(t('questions.four'))}
          variant={'outline'}
          className={'rounded-full py-2 px-4 shadow-sm'}
        >
          {t('questions.four')}
        </Button>
      </div>


    </div>
  );
}


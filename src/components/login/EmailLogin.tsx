import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import isEmail from 'validator/lib/isEmail';

import { LOGIN_ACTION } from '@/components/login/const';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createHotkey, HOT_KEY_NAME } from '@/utils/hotkeys';

function EmailLogin({ redirectTo }: { redirectTo: string }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [, setSearch] = useSearchParams();

  const handleSubmitPassword = (e?: React.MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    const isValidEmail = isEmail(email);

    if (!isValidEmail) {
      setError(t('signIn.invalidEmail'));
      return;
    }

    setSearch((prev) => {
      prev.set('email', email);
      prev.set('action', LOGIN_ACTION.ENTER_PASSWORD);
      return prev;
    });
  };

  return (
    <div className={'flex w-full max-w-[320px] flex-col items-center justify-center gap-3'}>
      <div className={'flex w-full flex-col gap-1'}>
        <Input
          data-testid="login-email-input"
          autoFocus
          size={'md'}
          variant={error ? 'destructive' : 'default'}
          type={'email'}
          className={'w-full'}
          onChange={(e) => {
            setError('');
            setEmail(e.target.value);
          }}
          value={email}
          placeholder={t('signIn.pleaseInputYourEmail')}
          onKeyDown={(e) => {
            if (createHotkey(HOT_KEY_NAME.ENTER)(e.nativeEvent)) {
              handleSubmitPassword();
            }
          }}
        />
        {error && <div className={cn('help-text text-xs text-text-error')}>{error}</div>}
      </div>

      <Button data-testid="login-password-button" onClick={handleSubmitPassword} size={'lg'} className={'w-full'}>
        {t('signIn.signInWithPassword')}
      </Button>
    </div>
  );
}

export default EmailLogin;

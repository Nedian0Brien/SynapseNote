import { Alert } from '@mui/material';
import { FallbackProps } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';

export function ElementFallbackRender({
  error,
  description,
}: FallbackProps & {
  description?: string;
}) {
  const { t } = useTranslation();

  return (
    <Alert severity={'error'} variant={'standard'} contentEditable={false} className={'my-2 overflow-hidden'}>
      <p>{t('error.generalError')}:</p>
      <pre className={'truncate'}>{error.message}</pre>
      {description && <pre>{description}</pre>}
    </Alert>
  );
}

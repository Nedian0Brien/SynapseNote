import { Alert } from '@mui/material';

import { ReactComponent as WarningIcon } from '@/assets/icons/close.svg';
import emptyImageSrc from '@/assets/images/empty.png';

function SomethingError({ error }: { error: Error }) {
  return (
    <div className={'flex h-full w-full flex-col items-center justify-center'}>
      <div className={'flex items-center gap-4 text-2xl font-bold text-text-primary opacity-70'}>
        <WarningIcon className={'h-12 w-12'} />
        SomethingError
      </div>
      <Alert className={'max-w-[90%] whitespace-pre-wrap break-words px-6 '} severity={'error'}>
        {error.message}
      </Alert>
      <div className={'mt-4 whitespace-pre text-center text-lg text-text-primary opacity-50'}>
        {`We're sorry for inconvenience\n`}
        문의가 필요하면{' '}
        <a
          className={'text-text-action underline'}
          href={'mailto:parkmj9260@gmail.com'}
        >
          이메일
        </a>{' '}
        로 오류 내용을 보내주세요
      </div>
      <img src={emptyImageSrc} alt={'SynapseNote'} />
    </div>
  );
}

export default SomethingError;

import { Divider } from '@mui/material';

import { ReactComponent as SynapseNoteLogo } from '@/assets/icons/synapsenote-wordmark.svg';

function SynapseNotePower({ divider, width }: { divider?: boolean; width?: number }) {
  return (
    <div
      style={{
        width,
      }}
      className={
        'sticky bottom-[-0.5px] flex w-full transform-gpu flex-col items-center justify-center rounded-[16px] bg-background-primary'
      }
    >
      {divider && <Divider className={'my-0 w-full'} />}

      <div
        onClick={() => {
          window.open('/app', '_self');
        }}
        style={{
          width,
        }}
        className={
          'flex  w-full cursor-pointer items-center justify-center gap-2 py-4 text-sm text-text-primary opacity-50'
        }
      >
        <SynapseNoteLogo className={'w-[88px]'} />
      </div>
    </div>
  );
}

export default SynapseNotePower;

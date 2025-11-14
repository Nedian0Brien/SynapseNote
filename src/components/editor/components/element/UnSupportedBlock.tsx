import { EditorElementProps } from '@/components/editor/editor.type';
import { Alert } from '@mui/material';
import { forwardRef } from 'react';

export const UnSupportedBlock = forwardRef<HTMLDivElement, EditorElementProps>(({ node, children }, ref) => {
  return (
    <div className={'w-full select-none'} ref={ref} contentEditable={false}>
      <Alert className={'h-fit w-full'} severity={'warning'}>
        <div className={'text-base font-semibold'}>{`Unsupported Block: ${node.type}`}</div>

        <div className={'my-4 whitespace-pre font-medium'}>
          {`We're sorry for inconvenience \n`}
          Submit an issue on our{' '}
          <a
            className={'text-text-action underline'}
            href={'https://github.com/AppFlowy-IO/AppFlowy/issues/new?template=bug_report.yaml'}
          >
            Github
          </a>{' '}
          page that describes your error
        </div>

        <span className={'text-sm'}>
          <pre>
            <code>{JSON.stringify(node, null, 2)}</code>
          </pre>
        </span>
        {children}
      </Alert>
    </div>
  );
});

import { CalloutNode, EditorElementProps } from '@/components/editor/editor.type';
import { forwardRef, memo } from 'react';

export const Callout = memo(
  forwardRef<HTMLDivElement, EditorElementProps<CalloutNode>>(({ node: _node, children, ...attributes }, ref) => {
    return (
      <>
        <div
          ref={ref}
          {...attributes}
          className={`${
            attributes.className ?? ''
          } my-0.5 flex w-full flex-col rounded border border-border-primary bg-fill-list-active py-2.5 pr-2`}
        >
          {children}
        </div>
      </>
    );
  })
);

export default Callout;

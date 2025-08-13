import { debounce } from 'lodash-es';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const isCursorAtEnd = (el: HTMLDivElement) => {
  const selection = window.getSelection();

  if (!selection) return false;

  const range = selection.getRangeAt(0);
  const text = el.textContent || '';

  return range.startOffset === text.length;
};

const getCursorOffset = () => {
  const selection = window.getSelection();

  if (!selection) return 0;

  const range = selection.getRangeAt(0);

  return range.startOffset;
};

const setCursorPosition = (element: HTMLDivElement, position: number) => {
  const range = document.createRange();
  const selection = window.getSelection();

  if (!element.firstChild) return;

  const textNode = element.firstChild;
  const maxPosition = textNode.textContent?.length || 0;
  const safePosition = Math.min(position, maxPosition);

  range.setStart(textNode, safePosition);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
};

function TitleEditable({
  viewId,
  name,
  onUpdateName,
  onEnter,
  onFocus,
}: {
  viewId: string;
  name: string;
  onUpdateName: (name: string) => void;
  onEnter?: (text: string) => void;
  onFocus?: () => void;
}) {
  const { t } = useTranslation();
  const debounceUpdateName = useMemo(() => {
    return debounce(onUpdateName, 200);
  }, [onUpdateName]);

  const contentRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const cursorPositionRef = useRef<number>(0);
  const initialEditValueRef = useRef<string>('');

  // Only update the content when not editing
  useEffect(() => {
    if (!isEditing && contentRef.current && contentRef.current.textContent !== name) {
      const cursorPosition = cursorPositionRef.current;

      contentRef.current.textContent = name;

      // If the element has focus, restore the cursor position
      if (document.activeElement === contentRef.current) {
        setTimeout(() => {
          if (contentRef.current) {
            setCursorPosition(contentRef.current, cursorPosition);
          }
        }, 0);
      }
    }
  }, [name, isEditing]);

  const focusedTextbox = () => {
    const contentBox = contentRef.current;

    if (!contentBox) return;

    const textbox = document.getElementById(`editor-${viewId}`) as HTMLElement;

    textbox?.focus();
  };

  // Set focus and cursor position when initializing
  useEffect(() => {
    const contentBox = contentRef.current;

    if (!contentBox) return;

    // Record the initial value (for subsequent editing comparison)
    initialEditValueRef.current = contentBox.textContent || '';

    contentBox.focus();

    // Move the cursor to the end
    if (contentBox.textContent !== '') {
      setTimeout(() => {
        setCursorPosition(contentBox, contentBox.textContent?.length || 0);
      }, 0);
    }
  }, []);

  return (
    <div
      ref={contentRef}
      suppressContentEditableWarning={true}
      id={`editor-title-${viewId}`}
      style={{
        wordBreak: 'break-word',
      }}
      className={
        'custom-caret relative flex-1 cursor-text whitespace-pre-wrap break-words empty:before:text-text-tertiary empty:before:content-[attr(data-placeholder)] focus:outline-none'
      }
      data-placeholder={t('menuAppHeader.defaultNewPageName')}
      contentEditable={true}
      aria-readonly={false}
      autoFocus={true}
      onFocus={() => {
        // Record the initial value when starting to edit
        if (contentRef.current) {
          initialEditValueRef.current = contentRef.current.textContent || '';
        }

        setIsEditing(true);
        onFocus?.();
      }}
      onBlur={() => {
        // Immediately save the user's latest input to avoid content loss due to debounce
        if (contentRef.current) {
          const currentText = contentRef.current.textContent || '';
          const initialValue = initialEditValueRef.current;

          // Cancel debounce, update immediately (but only when the user really modified the content)
          debounceUpdateName.cancel();
          if (currentText !== initialValue) {
            onUpdateName(currentText);
          }
        }

        // Delay a bit before setting the editing state to avoid issues with rapid focus switching
        setTimeout(() => {
          setIsEditing(false);
        }, 100);
      }}
      onInput={() => {
        if (!contentRef.current) return;

        // Save the current cursor position
        cursorPositionRef.current = getCursorOffset();

        // Clean up the automatically inserted <br> tags by the browser
        if (contentRef.current.innerHTML === '<br>') {
          contentRef.current.innerHTML = '';
        }

        // Debounce update remote data
        debounceUpdateName(contentRef.current.textContent || '');
      }}
      onKeyDown={(e) => {
        if (!contentRef.current) return;

        // Save the current cursor position
        cursorPositionRef.current = getCursorOffset();

        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          if (e.key === 'Enter') {
            const offset = getCursorOffset();
            const beforeText = contentRef.current.textContent?.slice(0, offset) || '';
            const afterText = contentRef.current.textContent?.slice(offset) || '';

            contentRef.current.textContent = beforeText;
            setIsEditing(false);
            onUpdateName(beforeText);
            onEnter?.(afterText);

            setTimeout(() => {
              focusedTextbox();
            }, 0);
          } else {
            // Escape key: complete editing and save the current content
            setIsEditing(false);
            onUpdateName(contentRef.current.textContent || '');
          }
        } else if (e.key === 'ArrowDown' || (e.key === 'ArrowRight' && isCursorAtEnd(contentRef.current))) {
          e.preventDefault();
          focusedTextbox();
        }
      }}
    />
  );
}

export default memo(TitleEditable);

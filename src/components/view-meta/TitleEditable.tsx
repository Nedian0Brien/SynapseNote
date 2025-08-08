import { debounce } from 'lodash-es';
import { memo, useEffect, useMemo, useRef } from 'react';
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
  const timestampsRef = useRef<{
    local: number;
    remote: number;
  }>({
    local: 0,
    remote: 0,
  });

  useEffect(() => {
    timestampsRef.current.remote = Date.now();
    if (contentRef.current && timestampsRef.current.local < timestampsRef.current.remote) {
      contentRef.current.textContent = name;
    }
  }, [name]);

  useEffect(() => {
    if (contentRef.current) {
      const activeElement = document.activeElement;

      if (activeElement === contentRef.current) {
        return;
      }

      contentRef.current.textContent = name;
    }
  }, [name]);

  const focusedTextbox = () => {
    const contentBox = contentRef.current;

    if (!contentBox) return;

    const textbox = document.getElementById(`editor-${viewId}`) as HTMLElement;

    textbox?.focus();
  };

  useEffect(() => {
    const contentBox = contentRef.current;

    if (!contentBox) return;
    contentBox.focus();
    if (contentBox.textContent !== '') {
      const range = document.createRange();
      const sel = window.getSelection();

      range.setStart(contentBox.childNodes[0], contentBox.textContent?.length || 0);
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
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
        onFocus?.();
      }}
      onInput={() => {
        if (!contentRef.current) return;
        timestampsRef.current.local = Date.now();
        debounceUpdateName(contentRef.current.textContent || '');
        if (contentRef.current.innerHTML === '<br>') {
          contentRef.current.innerHTML = '';
        }
      }}
      onKeyDown={(e) => {
        if (!contentRef.current) return;
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          if (e.key === 'Enter') {
            const offset = getCursorOffset();
            const beforeText = contentRef.current.textContent?.slice(0, offset) || '';
            const afterText = contentRef.current.textContent?.slice(offset) || '';

            contentRef.current.textContent = beforeText;
            timestampsRef.current.remote = Date.now();
            onUpdateName(beforeText);
            onEnter?.(afterText);

            setTimeout(() => {
              focusedTextbox();
            }, 0);
          } else {
            timestampsRef.current.remote = Date.now();
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

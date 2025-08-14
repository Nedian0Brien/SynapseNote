import { debounce } from 'lodash-es';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface UpdateState {
  localName: string;
  lastConfirmedName: string;
  pendingUpdate: string | null;
  updateId: string | null;
}

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

  // Use ref to manage state, avoid re-rendering
  const updateStateRef = useRef<UpdateState>({
    localName: name,
    lastConfirmedName: name,
    pendingUpdate: null,
    updateId: null,
  });
  const [isEditing, setIsEditing] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const cursorPositionRef = useRef<number>(0);
  const initialEditValueRef = useRef<string>('');

  // Generate unique update ID
  const generateUpdateId = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Send update to remote
  const sendUpdate = useCallback(
    (newName: string) => {
      const updateId = generateUpdateId();

      console.log('Sending update:', { newName, updateId });

      updateStateRef.current = {
        ...updateStateRef.current,
        pendingUpdate: newName,
        updateId,
      };

      // Call original update function
      onUpdateName(newName);
    },
    [onUpdateName, generateUpdateId]
  );

  // Delayed update sending
  const debounceUpdateName = useMemo(() => {
    return debounce(sendUpdate, 200);
  }, [sendUpdate]);

  // Smart update sending: wait if pending, send if no pending
  const smartSendUpdate = useCallback(
    (newName: string, immediate = false) => {
      // If there's a pending update, unless explicitly requested to send immediately, wait for confirmation
      if (updateStateRef.current.pendingUpdate && !immediate) {
        console.log('Pending update exists, defer sending, update local state');
        // Only update local state, don't send to remote
        updateStateRef.current = {
          ...updateStateRef.current,
          localName: newName,
        };
        return;
      }

      // No pending or explicitly requested to send immediately
      if (immediate) {
        console.log('Sending update immediately');
        sendUpdate(newName);
      } else {
        console.log('Sending update with delay');
        debounceUpdateName(newName);
      }
    },
    [sendUpdate, debounceUpdateName]
  );

  // Handle remote name changes
  useEffect(() => {
    console.log('Remote name changed:', {
      newName: name,
      pendingUpdate: updateStateRef.current.pendingUpdate,
      lastConfirmedName: updateStateRef.current.lastConfirmedName,
      isEditing,
    });

    // If editing, ignore all remote updates
    if (isEditing) {
      return;
    }

    // Check if this is a confirmation of local update
    if (updateStateRef.current.pendingUpdate && name === updateStateRef.current.pendingUpdate) {
      console.log('Local update confirmed successfully');
      const currentLocalName = updateStateRef.current.localName;

      updateStateRef.current = {
        ...updateStateRef.current,
        lastConfirmedName: name,
        localName: name,
        pendingUpdate: null,
        updateId: null,
      };

      // If local has newer content, continue sending
      if (currentLocalName !== name) {
        console.log('Found newer local content after confirmation, continue sending:', currentLocalName);
        smartSendUpdate(currentLocalName);
      }

      return;
    }

    // If there's a pending update, remote update has overridden previous local update
    if (updateStateRef.current.pendingUpdate) {
      console.log('Remote update overrode local update, use latest local content');

      // Clear pending state, use latest local content
      updateStateRef.current = {
        ...updateStateRef.current,
        lastConfirmedName: name,
        pendingUpdate: null,
        updateId: null,
      };

      // If local content differs from remote, continue sending local update
      if (updateStateRef.current.localName !== name) {
        console.log('Continue sending latest local content:', updateStateRef.current.localName);
        smartSendUpdate(updateStateRef.current.localName, true);
      }

      return;
    }

    console.log('Accepting remote update');
    updateStateRef.current = {
      ...updateStateRef.current,
      localName: name,
      lastConfirmedName: name,
    };

    // Only update UI content when not focused, avoid cursor jumping
    if (contentRef.current) {
      contentRef.current.textContent = name;
    }
  }, [name, isEditing, smartSendUpdate]);

  const focusedTextbox = useCallback(() => {
    const contentBox = contentRef.current;

    if (!contentBox) return;

    const textbox = document.getElementById(`editor-${viewId}`) as HTMLElement;

    textbox?.focus();
  }, [viewId]);

  // Initialize settings
  useEffect(() => {
    const contentBox = contentRef.current;

    if (!contentBox) return;

    // Set initial content to local state
    contentBox.textContent = updateStateRef.current.localName;
    initialEditValueRef.current = updateStateRef.current.localName;

    contentBox.focus();

    // Move cursor to end
    if (contentBox.textContent !== '') {
      setTimeout(() => {
        setCursorPosition(contentBox, contentBox.textContent?.length || 0);
      }, 0);
    }
  }, []); // Only execute once when component mounts

  return (
    <div
      ref={contentRef}
      suppressContentEditableWarning={true}
      id={`editor-title-${viewId}`}
      data-testid="page-title-input"
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
        // Record initial value when starting to edit
        if (contentRef.current) {
          initialEditValueRef.current = contentRef.current.textContent || '';
        }

        setIsEditing(true);
        onFocus?.();
      }}
      onBlur={() => {
        // Immediately save user's latest input to avoid content loss due to debounce
        if (contentRef.current) {
          const currentText = contentRef.current.textContent || '';
          const initialValue = initialEditValueRef.current;

          // Update local state
          updateStateRef.current = {
            ...updateStateRef.current,
            localName: currentText,
          };

          // Cancel debounce, update immediately (but only when user really modified content)
          debounceUpdateName.cancel();
          if (currentText !== initialValue) {
            smartSendUpdate(currentText, true);
          }
        }

        // Delay setting editing state to avoid issues with rapid focus switching
        setTimeout(() => {
          setIsEditing(false);
        }, 100);
      }}
      onInput={() => {
        if (!contentRef.current) return;

        // Save current cursor position
        cursorPositionRef.current = getCursorOffset();

        // Clean up browser auto-inserted <br> tags
        if (contentRef.current.innerHTML === '<br>') {
          contentRef.current.innerHTML = '';
        }

        const currentText = contentRef.current.textContent || '';

        // Update local state
        updateStateRef.current = {
          ...updateStateRef.current,
          localName: currentText,
        };

        // Smart update remote data
        smartSendUpdate(currentText);
      }}
      onKeyDown={(e) => {
        if (!contentRef.current) return;

        // Save current cursor position
        cursorPositionRef.current = getCursorOffset();

        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();

          if (e.key === 'Enter') {
            const currentText = e.currentTarget.textContent || '';
            const offset = getCursorOffset();

            if (offset >= currentText.length || offset <= 0) {
              // Cursor at end or position inaccurate, keep all text
              setIsEditing(false);
              updateStateRef.current = {
                ...updateStateRef.current,
                localName: currentText,
              };
              smartSendUpdate(currentText, true);
              onEnter?.('');
            } else {
              // Cursor in middle, split text
              const beforeText = currentText.slice(0, offset);
              const afterText = currentText.slice(offset);

              contentRef.current.textContent = beforeText;
              setIsEditing(false);
              updateStateRef.current = {
                ...updateStateRef.current,
                localName: beforeText,
              };
              smartSendUpdate(beforeText, true);
              onEnter?.(afterText);
            }

            setTimeout(() => {
              focusedTextbox();
            }, 0);
          } else {
            // Escape key: complete editing and save current content
            const currentText = contentRef.current.textContent || '';

            setIsEditing(false);
            updateStateRef.current = {
              ...updateStateRef.current,
              localName: currentText,
            };
            smartSendUpdate(currentText, true);
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

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

export function createInlineHistoryKeyDown(input: {
  undoToken: string | null;
  redoToken: string | null;
  undo: () => void;
  redo: () => void;
}) {
  return (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
    const target = event.target;
    const elementTarget = target instanceof HTMLElement ? target : null;
    if (
      elementTarget &&
      (elementTarget.tagName === 'INPUT' ||
        elementTarget.tagName === 'TEXTAREA' ||
        elementTarget.tagName === 'SELECT' ||
        elementTarget.isContentEditable)
    ) {
      return;
    }
    if (event.shiftKey) {
      if (!input.redoToken) return;
      event.preventDefault();
      input.redo();
      return;
    }
    if (!input.undoToken) return;
    event.preventDefault();
    input.undo();
  };
}

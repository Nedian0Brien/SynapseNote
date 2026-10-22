import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';

const KEYBOARD_STEP = 16;
const KEYBOARD_PAGE_STEP = 64;

interface SidebarPaneResizeHandleProps {
  /** Current height of the pane above the handle, in pixels. */
  readonly height: number;
  readonly minHeight: number;
  readonly maxHeight: number;
  /** Accessible name — say which pane the handle sizes. */
  readonly label: string;
  readonly onHeightChange: (height: number) => void;
  /** Double-click restores the pane's default height. */
  readonly onReset: () => void;
  readonly testId?: string;
}

/**
 * Horizontal drag handle that sizes the sidebar pane directly above it.
 *
 * Sits in the seam between two stacked sidebar sections, so it stays visually
 * silent until pointed at — the seam is already a boundary, and a permanent
 * bar there would read as a divider the user cannot act on. Keyboard users get
 * the same control through the separator role: arrows nudge, page keys jump,
 * Home/End reach the limits.
 */
export function SidebarPaneResizeHandle({
  height,
  minHeight,
  maxHeight,
  label,
  onHeightChange,
  onReset,
  testId,
}: SidebarPaneResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef<{ pointerY: number; height: number } | null>(null);

  function clamp(next: number): number {
    return Math.min(maxHeight, Math.max(minHeight, Math.round(next)));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    // Keep the drag from selecting the chat titles it passes over.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOrigin.current = { pointerY: event.clientY, height };
    setDragging(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const origin = dragOrigin.current;
    if (origin === null) return;
    onHeightChange(clamp(origin.height + (event.clientY - origin.pointerY)));
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragOrigin.current === null) return;
    dragOrigin.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === 'ArrowUp'
        ? -KEYBOARD_STEP
        : event.key === 'ArrowDown'
          ? KEYBOARD_STEP
          : event.key === 'PageUp'
            ? -KEYBOARD_PAGE_STEP
            : event.key === 'PageDown'
              ? KEYBOARD_PAGE_STEP
              : null;
    if (step !== null) {
      event.preventDefault();
      onHeightChange(clamp(height + step));
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      onHeightChange(minHeight);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      onHeightChange(maxHeight);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      onReset();
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: an adjustable separator carries pointer + keyboard resize handlers and aria-value state; <hr> cannot host that control.
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      aria-valuenow={Math.round(height)}
      aria-valuemin={minHeight}
      aria-valuemax={maxHeight}
      tabIndex={0}
      data-dragging={dragging}
      data-testid={testId}
      className={cn(
        'group/pane-resize relative flex h-2 w-full shrink-0 cursor-row-resize touch-none items-center outline-hidden',
        'after:absolute after:inset-x-2 after:top-1/2 after:h-[2px] after:-translate-y-1/2 after:rounded-full after:bg-transparent after:transition-colors',
        'hover:after:bg-sidebar-border focus-visible:after:bg-sidebar-ring data-[dragging=true]:after:bg-sidebar-ring',
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
    />
  );
}

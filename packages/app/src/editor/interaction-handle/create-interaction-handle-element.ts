export interface InteractionHandleElementOptions {
  addLabel?: string;
  gripLabel?: string;
  selectionLabel?: string;
  optOutAttribute?: string;
}

export interface InteractionHandleElements {
  container: HTMLDivElement;
  addButton: HTMLButtonElement;
  grip: HTMLButtonElement;
  selectionButton?: HTMLButtonElement;
}

const PLUS_ICON =
  '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';
const GRIP_ICON =
  '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-grip-vertical-icon lucide-grip-vertical"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>';
const CHECK_ICON =
  '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><path d="m5 12 4 4L19 6"/></svg>';

/**
 * Creates the same imperative native handle used by the editor drag handle.
 * The element is deliberately not a React subtree: the TipTap plugin and the
 * database overlay both reposition this node outside their logical tree.
 */
export function createInteractionHandleElement(
  options: InteractionHandleElementOptions = {},
): InteractionHandleElements {
  const container = document.createElement('div');
  container.className = 'ok-block-controls';
  container.style.gap = `${INTERACTION_HANDLE_CONTROL_GAP}px`;
  container.dataset.interactionHandle = '';
  if (options.optOutAttribute) container.setAttribute(options.optOutAttribute, 'true');
  container.style.visibility = 'hidden';

  const addButton = document.createElement('button');
  addButton.className = 'ok-add-block-btn';
  addButton.setAttribute('aria-label', options.addLabel ?? 'Add block below');
  addButton.type = 'button';
  addButton.innerHTML = PLUS_ICON;
  addButton.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  const grip = document.createElement('button');
  grip.className = 'ok-drag-grip';
  grip.setAttribute('aria-label', options.gripLabel ?? 'Select block');
  grip.type = 'button';
  grip.tabIndex = -1;
  grip.innerHTML = GRIP_ICON;

  const selectionButton = options.selectionLabel ? document.createElement('button') : undefined;
  if (selectionButton) {
    selectionButton.className = 'ok-row-selection-btn';
    selectionButton.setAttribute('aria-label', options.selectionLabel ?? 'Select row');
    selectionButton.setAttribute('aria-checked', 'false');
    selectionButton.setAttribute('role', 'checkbox');
    selectionButton.type = 'button';
    selectionButton.innerHTML = CHECK_ICON;
    selectionButton.tabIndex = 0;
    selectionButton.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  }

  container.append(addButton, grip);
  if (selectionButton) container.append(selectionButton);
  return { container, addButton, grip, selectionButton };
}

import { INTERACTION_HANDLE_CONTROL_GAP } from '@/lib/interaction-handle-geometry';

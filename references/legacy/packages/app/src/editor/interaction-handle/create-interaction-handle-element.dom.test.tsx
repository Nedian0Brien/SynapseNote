import { describe, expect, test } from 'bun:test';
import { createInteractionHandleElement } from './create-interaction-handle-element';

describe('createInteractionHandleElement', () => {
  test('creates the shared native chrome used by editor and database surfaces', () => {
    const handle = createInteractionHandleElement({
      addLabel: 'Add page below',
      gripLabel: 'Select page',
      optOutAttribute: 'data-test-opt-out',
    });

    expect(handle.container.className).toBe('ok-block-controls');
    expect(handle.container.dataset.interactionHandle).toBe('');
    expect(handle.container.getAttribute('data-test-opt-out')).toBe('true');
    expect(handle.addButton.className).toBe('ok-add-block-btn');
    expect(handle.addButton.getAttribute('aria-label')).toBe('Add page below');
    expect(handle.grip.className).toBe('ok-drag-grip');
    expect(handle.grip.getAttribute('aria-label')).toBe('Select page');
    expect(handle.grip.tabIndex).toBe(-1);
    expect(handle.container.querySelectorAll('svg')).toHaveLength(2);

    document.body.append(handle.container);
    handle.container.remove();
  });

  test('prevents the add affordance from starting a drag', () => {
    const handle = createInteractionHandleElement();
    document.body.append(handle.container);
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    const dispatchResult = handle.addButton.dispatchEvent(event);
    expect(dispatchResult).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    handle.container.remove();
  });
});

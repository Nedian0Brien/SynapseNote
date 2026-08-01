import { describe, expect, test } from 'bun:test';
import { shouldHandleJsxNodeViewKey } from './jsx-component-view-interaction-policy';

describe('shouldHandleJsxNodeViewKey', () => {
  test('reserves delete for the innermost NodeSelection outside native text inputs', () => {
    expect(
      shouldHandleJsxNodeViewKey({ inTextInput: false, isInnermostSelected: true, key: 'Delete' }),
    ).toBe('delete');
    expect(
      shouldHandleJsxNodeViewKey({
        inTextInput: true,
        isInnermostSelected: true,
        key: 'Backspace',
      }),
    ).toBe('ignore');
  });

  test('opens properties only for selected descriptors with editable props', () => {
    expect(
      shouldHandleJsxNodeViewKey({ hasEditableProps: true, isSelected: true, key: 'Enter' }),
    ).toBe('popover');
    expect(
      shouldHandleJsxNodeViewKey({ hasEditableProps: false, isSelected: true, key: ' ' }),
    ).toBe('ignore');
  });
});

import { describe, expect, test } from 'bun:test';
import { isJsxInteractiveTarget } from './JsxComponentView.tsx';

describe('isJsxInteractiveTarget', () => {
  test('recognizes native and ARIA controls inside a leaf component', () => {
    const button = document.createElement('button');
    const gridCell = document.createElement('div');
    gridCell.setAttribute('role', 'gridcell');
    const contentEditable = document.createElement('div');
    contentEditable.setAttribute('contenteditable', 'true');

    expect(isJsxInteractiveTarget(button)).toBe(true);
    expect(isJsxInteractiveTarget(gridCell)).toBe(true);
    expect(isJsxInteractiveTarget(contentEditable)).toBe(true);
  });

  test('recognizes an interactive ancestor when the click lands on its text', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-jsx-interactive', '');
    const label = document.createElement('span');
    wrapper.append(label);

    expect(isJsxInteractiveTarget(label)).toBe(true);
  });

  test('does not classify plain rendered body content as interactive', () => {
    const paragraph = document.createElement('p');
    expect(isJsxInteractiveTarget(paragraph)).toBe(false);
    expect(isJsxInteractiveTarget(null)).toBe(false);
  });
});

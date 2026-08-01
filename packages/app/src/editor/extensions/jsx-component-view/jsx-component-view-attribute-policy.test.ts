import { describe, expect, test } from 'bun:test';
import {
  deriveJsxAttributePolicy,
  updateElementJsxProps,
} from './jsx-component-view-attribute-policy';

describe('deriveJsxAttributePolicy', () => {
  test('keeps an explicit align value and centers an alignable descriptor without one', () => {
    expect(
      deriveJsxAttributePolicy({
        currentProps: { align: 'right' },
        isAlignable: true,
        props: [],
      }).dataAlign,
    ).toBe('right');
    expect(
      deriveJsxAttributePolicy({ currentProps: {}, isAlignable: true, props: [] }).dataAlign,
    ).toBe('center');
  });

  test('marks only an absent required visible string prop as needing configuration', () => {
    const props = [
      { name: 'alt', type: 'string', required: true },
      { name: 'caption', type: 'string', required: false },
      { hidden: true, name: 'internal', type: 'string', required: true },
    ];
    expect(
      deriveJsxAttributePolicy({ currentProps: {}, isAlignable: false, props }).needsConfig,
    ).toBe(true);
    expect(
      deriveJsxAttributePolicy({ currentProps: { alt: '' }, isAlignable: false, props })
        .needsConfig,
    ).toBe(false);
  });
});

describe('updateElementJsxProps', () => {
  test('writes a prop and marks the element source dirty', () => {
    expect(
      updateElementJsxProps({ kind: 'element', props: { title: 'Old' } }, 'title', 'New'),
    ).toEqual({
      kind: 'element',
      props: { title: 'New' },
      sourceDirty: true,
    });
  });

  test('clears a prop and its preserved JSX attribute instead of serializing undefined', () => {
    const attributes = [
      { type: 'mdxJsxAttribute', name: 'width', value: '200' },
      { type: 'mdxJsxAttribute', name: 'alt', value: 'image' },
    ];
    expect(
      updateElementJsxProps(
        { attributes, kind: 'element', props: { width: 200, alt: 'image' } },
        'width',
        undefined,
      ),
    ).toEqual({
      attributes: [{ type: 'mdxJsxAttribute', name: 'alt', value: 'image' }],
      kind: 'element',
      props: { alt: 'image' },
      sourceDirty: true,
    });
  });
});

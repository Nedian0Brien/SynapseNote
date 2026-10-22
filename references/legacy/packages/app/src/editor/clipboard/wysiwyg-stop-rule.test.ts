import { describe, expect, test } from 'bun:test';
import { buildPatternDConstructorOptions } from '../TiptapEditor';
import { buildSeededPatternDProvider, fakeClipboard } from '../walk-currency-test-harness';

type WysiwygEditorProps = NonNullable<
  ReturnType<typeof buildPatternDConstructorOptions>['editorProps']
> & {
  handleDOMEvents?: Record<string, unknown>;
};

function buildWysiwygEditorProps(): WysiwygEditorProps {
  const { provider, cleanup } = buildSeededPatternDProvider('wysiwyg-stop-rule');
  try {
    return buildPatternDConstructorOptions({
      provider,
      clipboard: fakeClipboard,
      ctorStart: 0,
    }).editorProps as WysiwygEditorProps;
  } finally {
    cleanup();
  }
}

describe('WYSIWYG STOP rule — ProseMirror clipboard hooks', () => {
  test('wires the ProseMirror clipboard serializer hooks', () => {
    const props = buildWysiwygEditorProps();

    expect(typeof props.clipboardTextSerializer).toBe('function');
    expect(props.clipboardSerializer).toBe(fakeClipboard.html.serializer);
  });

  test('does not wire DOM-level copy/cut/dragstart handlers on editorProps', () => {
    const props = buildWysiwygEditorProps();
    const handleDOMEvents = props.handleDOMEvents ?? {};

    expect(handleDOMEvents).not.toHaveProperty('copy');
    expect(handleDOMEvents).not.toHaveProperty('cut');
    expect(handleDOMEvents).not.toHaveProperty('dragstart');
  });
});

import { expect, test } from 'bun:test';
import { DocumentContext } from './context';

test('DocumentContext is owned by the document-context boundary', () => {
  expect(DocumentContext).toBeDefined();
});

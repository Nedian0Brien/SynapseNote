import { afterEach, describe, expect, test } from 'bun:test';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { UploadAssetSuccess } from '@nedian0brien/synapsenote-core';
import { createLiveUploads, uploadedFileSource, uploadLiveFile } from './uploads';

if (typeof Window === 'undefined')
  Object.defineProperty(globalThis, 'Window', { value: window.Window, configurable: true });
const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});
function deferred() {
  let resolve!: (asset: UploadAssetSuccess) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<UploadAssetSuccess>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function mount(request: (file: File, docName: string) => Promise<UploadAssetSuccess>) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: 'before after',
      selection: { anchor: 7 },
      extensions: [createLiveUploads({ docName: 'notes/review' }, request)],
    }),
  });
  views.push(view);
  return view;
}

describe('live uploads', () => {
  test('uses canonical media, wiki attachment/document and relative fallback source forms', () => {
    const result = (filename: string) =>
      uploadedFileSource(
        filename,
        { src: filename, path: `attachments/${filename}` },
        'notes/review',
      );
    expect(result('photo.png')).toEqual({
      source: '<img src="/attachments/photo.png" />',
      block: true,
    });
    expect(result('clip.mp4').source).toBe('<video src="/attachments/clip.mp4" controls />');
    expect(result('song.mp3').source).toBe('<audio src="/attachments/song.mp3" controls />');
    expect(result('report.pdf').source).toBe('![[report.pdf]]');
    expect(result('Guide.md').source).toBe('[[guide|Guide]]');
    expect(uploadedFileSource('Guide.md', { src: 'Guide-1.md' }, 'notes/review').source).toBe(
      '[[guide-1|Guide]]',
    );
    expect(result('data.bin').source).toBe('[data.bin](../attachments/data.bin)');
    expect(uploadedFileSource('photo.png', { src: 'photo-1.png' }, 'notes/review').source).toBe(
      '<img src="/notes/photo-1.png" />',
    );
  });

  test('maps pending upload across remote edits and inserts once at the mapped position', async () => {
    const pending = deferred();
    const view = mount((_file, docName) => {
      expect(docName).toBe('notes/review');
      return pending.promise;
    });
    const upload = uploadLiveFile(view, new File(['pdf'], 'report.pdf'));
    expect(view.dom.querySelector('[role=status]')?.textContent).toContain('report.pdf');
    view.dispatch({ changes: { from: 0, insert: 'remote ' } });
    pending.resolve({ src: 'report-1.pdf', path: 'attachments/report-1.pdf' });
    await upload;
    expect(view.state.doc.toString()).toBe('remote before \n\n![[report-1.pdf]]\n\nafter');
    expect(view.dom.querySelector('[role=status]')).toBeNull();
  });

  test('failure cleans up loading without changing source and disposed editors do not insert', async () => {
    const failed = deferred();
    const view = mount(() => failed.promise);
    const upload = uploadLiveFile(view, new File(['x'], 'x.png'));
    failed.reject(new Error('Rejected upload'));
    await upload;
    expect(view.state.doc.toString()).toBe('before after');
    expect(view.dom.querySelector('[role=status]')).toBeNull();
    const pending = deferred();
    const disposed = mount(() => pending.promise);
    const late = uploadLiveFile(disposed, new File(['x'], 'x.png'));
    disposed.destroy();
    views.splice(views.indexOf(disposed), 1);
    pending.resolve({ src: 'x.png' });
    await late;
    expect(disposed.state.doc.toString()).toBe('before after');
  });

  test('a clipboard file uses the upload handler', async () => {
    const pending = deferred();
    let filename = '';
    const view = mount((file) => {
      filename = file.name;
      return pending.promise;
    });
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { files: [new File(['x'], 'x.png')] } });
    view.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(filename).toBe('x.png');
    pending.resolve({ src: 'x.png' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(view.state.doc.toString()).toContain('<img src="/notes/x.png" />');
  });
});

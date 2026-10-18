// replaces morrow's src/app/platform/files.ts; the web view has no downloads, so a saved file goes to the
// native app, which asks where to keep it. picking files stays morrow's file input, which the app answers
import { bytesToBase64 } from '../../vendor/morrow/src/core/portability';
import { post } from '../bridge';

export { newId, pickFiles, stamp } from '../../vendor/morrow/src/app/platform/files';

export function saveFile(name: string, content: BlobPart, type: string): void {
  void new Blob([content], { type })
    .arrayBuffer()
    .then((buffer) => post({ type: 'saveFile', name, mime: type, data: bytesToBase64(new Uint8Array(buffer)) }));
}

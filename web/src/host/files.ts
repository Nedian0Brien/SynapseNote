// replaces morrow's src/app/platform/files.ts, picking files waits for vault support, the rest is morrow's own
import { toast } from '../../vendor/morrow/src/app/ui';
import { ATTACHMENTS_UNAVAILABLE } from './attachments';

export { newId, saveFile, stamp } from '../../vendor/morrow/src/app/platform/files';

export function pickFiles(_accept: string, _multiple: boolean): Promise<File[]> {
  toast(ATTACHMENTS_UNAVAILABLE);
  return Promise.resolve([]);
}

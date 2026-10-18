// replaces morrow's src/app/router.ts, the native app owns navigation
import type { PageId } from '../../vendor/morrow/src/core/model';
import { post } from '../bridge';

export function openPage(id: PageId): void {
  post({ type: 'openPage', pageId: id });
}

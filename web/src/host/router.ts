// replaces morrow's src/app/router.ts, the native app owns navigation and the address follows the open page
import type { PageId } from '../../vendor/morrow/src/core/model';
import type { Route } from '../../vendor/morrow/src/app/router';
import { routeHash } from '../../vendor/morrow/src/app/router';
import { toast } from '../../vendor/morrow/src/app/ui';
import { post } from '../bridge';

export { parseRoute, routeHash } from '../../vendor/morrow/src/app/router';
export type { Route } from '../../vendor/morrow/src/app/router';

// morrow code reads the open page from the address, as trashing a page does
export function showRoute(pageId: PageId | null): void {
  history.replaceState(null, '', pageId ? routeHash({ name: 'page', id: pageId, find: null }) : '#/');
}

export function navigate(route: Route): void {
  if (route.name === 'page') post({ type: 'openPage', pageId: route.id, find: route.find });
  else if (route.name === 'home') post({ type: 'openPage', pageId: null });
  else toast('That view is not available yet.');
}

export function openPage(id: PageId, find: string | null = null): void {
  post({ type: 'openPage', pageId: id, find });
}

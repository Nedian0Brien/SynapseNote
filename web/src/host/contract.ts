// fails to compile when a host module stops matching the morrow module it replaces
import type * as MorrowActions from '../../vendor/morrow/src/app/actions';
import type * as MorrowAttachments from '../../vendor/morrow/src/app/platform/attachments';
import type * as MorrowDesktop from '../../vendor/morrow/src/app/platform/desktop';
import type * as MorrowFiles from '../../vendor/morrow/src/app/platform/files';
import type * as MorrowRouter from '../../vendor/morrow/src/app/router';
import type * as Actions from './actions';
import type * as Attachments from './attachments';
import type * as Desktop from './desktop';
import type * as Files from './files';
import type * as Router from './router';

type Same<Host, Original> = Host extends Original ? true : false;

// only the exports the editor imports are listed, the rest of each morrow module stays unused
export const contract: [
  Same<typeof Actions.formatShortcut, typeof MorrowActions.formatShortcut>,
  Same<typeof Attachments.fileUrl, typeof MorrowAttachments.fileUrl>,
  Same<typeof Attachments.storeFiles, typeof MorrowAttachments.storeFiles>,
  Same<typeof Attachments.downloadFile, typeof MorrowAttachments.downloadFile>,
  Same<typeof Attachments.formatBytes, typeof MorrowAttachments.formatBytes>,
  Same<typeof Desktop.openExternal, typeof MorrowDesktop.openExternal>,
  Same<typeof Desktop.isMac, typeof MorrowDesktop.isMac>,
  Same<typeof Files.pickFiles, typeof MorrowFiles.pickFiles>,
  Same<typeof Files.newId, typeof MorrowFiles.newId>,
  Same<typeof Router.openPage, typeof MorrowRouter.openPage>,
] = [true, true, true, true, true, true, true, true, true, true];

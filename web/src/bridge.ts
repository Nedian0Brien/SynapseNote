// messages between the editor page and the native app, the only way either side reaches the other
import type { Command } from '../vendor/morrow/src/core/commands';
import type { PageId, PageMeta } from '../vendor/morrow/src/core/model';
import { ACCENTS } from '../vendor/morrow/src/app/platform/preferences';
import type { Accent, PageWidth, WritingFont } from '../vendor/morrow/src/app/platform/preferences';
import type { SaveState } from '../vendor/morrow/src/storage/saveQueue';

export type Theme = 'light' | 'dark';

// sent by the native app through window.synapse.receive
export type InboundMessage =
  // opens the vault the app has access to, name is shown wherever the vault is named; guide puts morrow's
  // welcome guide into a vault opened for the first time, false for a folder about to be filled by sync;
  // compare has the page send its state deltas, for the app's debug comparison with its own session
  | { type: 'openVault'; name: string; guide: boolean; compare: boolean }
  // the appearance chosen in the app's settings, the theme comes on its own with the window's
  | { type: 'preferences'; preferences: ViewPreferences }
  // custom css shown as it is typed in the settings, and saved to the vault
  | { type: 'previewCss'; css: string }
  | { type: 'saveCss'; css: string }
  // a quick note, added to the end of today's note
  | { type: 'capture'; text: string }
  // find is text to select once the page is open, such as the words a search matched
  | { type: 'show'; pageId: PageId | null; find: string | null }
  | { type: 'rpcResult'; id: number; ok: true; value: unknown }
  | { type: 'rpcResult'; id: number; ok: false; error: string }
  // an edit another app made, read by the app's session (an ExternalPatch as JSON text); the page answers with
  // the pages it took in
  | { type: 'external'; id: number; json: string }
  // where each page lies and the saves per day, JSON text { paths, activity }
  | { type: 'vaultInfo'; json: string }
  // the app session's version of pages this page got out of step with, an ExternalPatch as JSON text
  | { type: 'resync'; json: string }
  // a page, a database or a canvas
  | { type: 'createPage'; parentId: PageId | null; kind: 'page' | 'database' | 'canvas' }
  | { type: 'trashPage'; pageId: PageId }
  // a morrow Command from a native screen, checked by morrow's applyCommand like any other; it arrives as JSON
  // text so a document's keys keep the order the app's session gave them
  | { type: 'command'; command: Command }
  // commands that only make sense together, applied all or none with morrow's runAll
  | { type: 'commands'; commands: Command[] }
  | { type: 'theme'; theme: Theme }
  // the open page's top level heading at this position is scrolled into view
  | { type: 'scrollToHeading'; index: number }
  // opens the open page's find bar
  | { type: 'find' }
  // today's daily note, or the one for a yyyy-mm-dd date, made when it does not exist yet
  | { type: 'openToday'; date: string | null }
  | { type: 'createFromTemplate'; templateId: PageId; parentId: PageId | null }
  // a new page in the templates page, or the templates page itself when there is none
  | { type: 'newTemplate' }
  | { type: 'openTemplates' }
  | { type: 'saveAsTemplate'; pageId: PageId }
  // morrow's page history dialog for a page
  | { type: 'openHistory'; pageId: PageId }
  // a version the app's history dialog chose, restored by the page with morrow's restoreVersion
  | { type: 'restoreVersion'; pageId: PageId; snapshotId: string }
  | { type: 'lockPage'; pageId: PageId }
  | { type: 'unprotectPage'; pageId: PageId }
  | { type: 'gradeCard'; cardId: string; grade: 'again' | 'hard' | 'good' | 'easy' }
  // morrow's data operations; each saves or picks its files through the app and reports in a toast
  | { type: 'exportMarkdown'; pageId: PageId }
  // the whole vault when pageId is null, otherwise the page and the pages inside it
  | { type: 'publish'; pageId: PageId | null }
  | { type: 'exportAll' }
  | { type: 'backup' }
  | { type: 'restore' }
  // imported pages go inside parentId, at the top level when it is null
  | { type: 'importMarkdown'; parentId: PageId | null }
  | { type: 'deleteUnusedFiles' }
  // the page shown as its markdown source, null for the editor
  | { type: 'setSourceMode'; pageId: PageId | null }
  // the page the app's own editor shows, so this page does not open it too; null when none
  | { type: 'nativeEditor'; pageId: PageId | null }
  // a toast's button was pressed, or the toast was closed, in the app
  | { type: 'toastAction'; id: number }
  | { type: 'dismissToast'; id: number };

// the settings morrow keeps in its preferences that the app's settings choose
export interface ViewPreferences {
  font: WritingFont;
  width: PageWidth;
  accent: Accent;
  colorful: boolean;
  name: string;
}

// a morrow toast as the app shows it, action is the label of its button
export interface ToastMessage {
  id: number;
  message: string;
  tone: 'info' | 'error';
  action: string | null;
}

// posted to the native app through window.webkit.messageHandlers.editor
export type OutboundMessage =
  | { type: 'ready' }
  | { type: 'rpc'; id: number; method: string; params: unknown[] }
  // locked lists the encrypted pages whose password has not been given yet
  | {
      type: 'workspace';
      pages: Record<PageId, PageMeta>;
      locked: PageId[];
      // the page shown as markdown source, null when every page is in the editor
      sourceMode: PageId | null;
      saveState: SaveState;
      saveError: string | null;
    }
  // newTab when the page was opened with a ctrl or cmd click
  | { type: 'openPage'; pageId: PageId | null; newTab?: boolean; find?: string | null }
  | { type: 'chooseIcon'; pageId: PageId }
  | { type: 'vaultFailed'; message: string }
  | { type: 'openExternal'; url: string }
  | { type: 'log'; level: 'error' | 'warning'; message: string }
  // a key the page received that belongs to the app, such as escape leaving focus mode
  | { type: 'shortcut'; shortcut: 'escape' }
  // one of the app's own views, such as the pages with a tag
  | { type: 'openView'; view: 'tasks' | 'tags' | 'tag'; tag?: string }
  // a file morrow saves, such as an export, data is base64; the app asks where to keep it
  | { type: 'saveFile'; name: string; mime: string; data: string }
  // every toast showing now, the app draws them over all of its screens
  | { type: 'toasts'; toasts: ToastMessage[] }
  // morrow's automatic backup, written by the app next to its own data
  | { type: 'autoBackup'; json: string }
  // the vault's custom css, when the vault opens and when it is saved
  | { type: 'customCss'; css: string }
  // the workspace records that changed, a StateDelta as JSON text so the app keeps every key in its order;
  // sent only for the app's debug comparison
  | { type: 'state'; json: string }
  // commands this page applied, JSON text { commands, all }, which the app's session applies the same way
  | { type: 'commands'; json: string }
  // the pages of an outside edit this page took in
  | { type: 'externalAccepted'; id: number; accepted: PageId[] }
  // flashcard progress after a grade, JSON text of morrow's ReviewLog, before it is written to the vault
  | { type: 'reviewLog'; json: string };

interface WebkitHandler {
  postMessage(message: unknown): void;
}

declare global {
  interface Window {
    webkit?: { messageHandlers?: { editor?: WebkitHandler } };
    synapse?: { receive(message: unknown): boolean } & HostApi;
  }
}

// what the app calls directly, for answers it waits for
export interface HostApi {
  flush(): Promise<boolean>;
  // a workspace answer as JSON text, null while no vault is open or for a query that is not known
  query(name: string, params: Record<string, unknown>): string | null;
  // opens the link editor when text is selected in the editor, as cmd k does there; false when nothing is selected
  linkSelection(): boolean;
  // encrypts a page with a password or unlocks one, the answer is JSON {ok} or {ok: false, error}
  encryption(action: string, params: Record<string, unknown>): Promise<string>;
  // the open page as html to print, JSON {title, html}; null when that page is not the one on screen
  pdfSnapshot(id: string): string | null;
  // the vault's images and files as JSON {count, bytes, unused}, null while no vault is open
  files(): Promise<string | null>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

// the values morrow's preferences.ts accepts, the name trimmed to its 60 characters
function parsePreferences(value: unknown): ViewPreferences | null {
  if (!isRecord(value)) return null;
  const { font, width, accent, colorful, name } = value;
  if (font !== 'serif' && font !== 'sans' && font !== 'mono') return null;
  if (width !== 'comfortable' && width !== 'wide') return null;
  if (!ACCENTS.includes(accent as Accent) || typeof colorful !== 'boolean' || typeof name !== 'string') return null;
  return { font, width, accent: accent as Accent, colorful, name: name.trim().slice(0, 60) };
}

// anything that does not match a known message exactly is dropped
export function parseInbound(value: unknown): InboundMessage | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case 'openVault':
      return typeof value.name === 'string'
        ? { type: 'openVault', name: value.name, guide: value.guide === true, compare: value.compare === true }
        : null;
    case 'preferences': {
      const preferences = parsePreferences(value.preferences);
      return preferences ? { type: 'preferences', preferences } : null;
    }
    case 'previewCss':
    case 'saveCss':
      return typeof value.css === 'string' ? { type: value.type, css: value.css } : null;
    case 'capture':
      return typeof value.text === 'string' ? { type: 'capture', text: value.text } : null;
    case 'show':
      if (value.pageId !== null && !isId(value.pageId)) return null;
      if (value.find !== undefined && value.find !== null && typeof value.find !== 'string') return null;
      return { type: 'show', pageId: value.pageId, find: value.find || null };
    case 'rpcResult':
      if (typeof value.id !== 'number') return null;
      if (value.ok === true) return { type: 'rpcResult', id: value.id, ok: true, value: value.value };
      return { type: 'rpcResult', id: value.id, ok: false, error: String(value.error ?? 'The app could not finish.') };
    case 'external':
      return Number.isInteger(value.id) && typeof value.json === 'string'
        ? { type: 'external', id: value.id as number, json: value.json }
        : null;
    case 'vaultInfo':
    case 'resync':
      return typeof value.json === 'string' ? { type: value.type, json: value.json } : null;
    case 'createPage': {
      if (value.parentId !== null && !isId(value.parentId)) return null;
      const kind = value.kind ?? 'page';
      return kind === 'page' || kind === 'database' || kind === 'canvas'
        ? { type: 'createPage', parentId: value.parentId, kind }
        : null;
    }
    case 'trashPage':
      return isId(value.pageId) ? { type: 'trashPage', pageId: value.pageId } : null;
    case 'commands': {
      if (typeof value.json !== 'string') return null;
      let commands: unknown;
      try {
        commands = JSON.parse(value.json);
      } catch {
        return null;
      }
      return Array.isArray(commands) &&
        commands.length > 0 &&
        commands.every((command) => isRecord(command) && typeof command.type === 'string')
        ? { type: 'commands', commands: commands as unknown as Command[] }
        : null;
    }
    case 'command': {
      // the shape is checked by morrow's applyCommand, this only makes sure there is a command to check
      if (typeof value.json !== 'string') return null;
      let command: unknown;
      try {
        command = JSON.parse(value.json);
      } catch {
        return null;
      }
      return isRecord(command) && typeof command.type === 'string'
        ? { type: 'command', command: command as unknown as Command }
        : null;
    }
    case 'theme':
      return value.theme === 'light' || value.theme === 'dark' ? { type: 'theme', theme: value.theme } : null;
    case 'scrollToHeading':
      return Number.isInteger(value.index) && (value.index as number) >= 0
        ? { type: 'scrollToHeading', index: value.index as number }
        : null;
    case 'find':
      return { type: 'find' };
    case 'openToday':
      if (value.date === null || value.date === undefined) return { type: 'openToday', date: null };
      return typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date)
        ? { type: 'openToday', date: value.date }
        : null;
    case 'createFromTemplate':
      return isId(value.templateId) && (value.parentId === null || isId(value.parentId))
        ? { type: 'createFromTemplate', templateId: value.templateId, parentId: value.parentId }
        : null;
    case 'newTemplate':
      return { type: 'newTemplate' };
    case 'openTemplates':
      return { type: 'openTemplates' };
    case 'saveAsTemplate':
      return isId(value.pageId) ? { type: 'saveAsTemplate', pageId: value.pageId } : null;
    case 'openHistory':
    case 'lockPage':
    case 'unprotectPage':
      return isId(value.pageId) ? { type: value.type, pageId: value.pageId } : null;
    case 'restoreVersion':
      return isId(value.pageId) && isId(value.snapshotId)
        ? { type: 'restoreVersion', pageId: value.pageId, snapshotId: value.snapshotId }
        : null;
    case 'gradeCard':
      return isId(value.cardId) &&
        (value.grade === 'again' || value.grade === 'hard' || value.grade === 'good' || value.grade === 'easy')
        ? { type: 'gradeCard', cardId: value.cardId, grade: value.grade }
        : null;
    case 'exportMarkdown':
      return isId(value.pageId) ? { type: 'exportMarkdown', pageId: value.pageId } : null;
    case 'publish':
      return value.pageId === null || isId(value.pageId) ? { type: 'publish', pageId: value.pageId } : null;
    case 'exportAll':
    case 'backup':
    case 'restore':
    case 'deleteUnusedFiles':
      return { type: value.type };
    case 'importMarkdown':
      return value.parentId === null || isId(value.parentId)
        ? { type: 'importMarkdown', parentId: value.parentId }
        : null;
    case 'setSourceMode':
      return value.pageId === null || isId(value.pageId) ? { type: 'setSourceMode', pageId: value.pageId } : null;
    case 'nativeEditor':
      return value.pageId === null || isId(value.pageId) ? { type: 'nativeEditor', pageId: value.pageId } : null;
    case 'toastAction':
    case 'dismissToast':
      return Number.isInteger(value.id) ? { type: value.type, id: value.id as number } : null;
    default:
      return null;
  }
}

export function post(message: OutboundMessage): void {
  globalThis.window?.webkit?.messageHandlers?.editor?.postMessage(message);
}

export function listen(handler: (message: InboundMessage) => void, api: HostApi): void {
  window.synapse = {
    receive(raw: unknown) {
      const message = parseInbound(raw);
      if (message) handler(message);
      return message !== null;
    },
    ...api,
  };
}

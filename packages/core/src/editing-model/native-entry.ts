/**
 * Entry point of the editing bundle the native apps load into JavaScriptCore
 * (`scripts/build-native-bundle.ts`). JavaScriptCore has no module loader, so
 * the bundle is an IIFE that publishes one global.
 */
import { computeLayout } from './layout.ts';
import { NativeEditorSession } from './native-session.ts';

const api = {
  /** Bumped when the JSON shapes the native side decodes change. */
  version: 1,
  createSession: (source: string) => new NativeEditorSession(source),
  computeLayout: (source: string) => JSON.stringify(computeLayout(source)),
};

(globalThis as { SynapseEditing?: typeof api }).SynapseEditing = api;

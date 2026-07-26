import { useDocumentContext } from '../DocumentContext';
import type { DocumentContextValue } from './document-context-types';

export type DocumentNavigation = Pick<
  DocumentContextValue,
  | 'activeTarget'
  | 'activeTabId'
  | 'activeDocName'
  | 'activeNewTabId'
  | 'isNewTabActive'
  | 'openDocument'
  | 'openDocumentTransition'
  | 'openTarget'
  | 'openTargetTransition'
  | 'clearTarget'
  | 'activateTab'
  | 'openNewTab'
  | 'activateNewTab'
  | 'closeNewTab'
>;

/**
 * Navigation-only document contract.
 *
 * Consumers that only need to navigate should depend on this boundary rather
 * than reaching into the collaboration pool, tab mutation commands, or panel
 * state exposed by the root context.
 */
export function useDocumentNavigation(): DocumentNavigation {
  const context = useDocumentContext();
  return {
    activeTarget: context.activeTarget,
    activeTabId: context.activeTabId,
    activeDocName: context.activeDocName,
    activeNewTabId: context.activeNewTabId,
    isNewTabActive: context.isNewTabActive,
    openDocument: context.openDocument,
    openDocumentTransition: context.openDocumentTransition,
    openTarget: context.openTarget,
    openTargetTransition: context.openTargetTransition,
    clearTarget: context.clearTarget,
    activateTab: context.activateTab,
    openNewTab: context.openNewTab,
    activateNewTab: context.activateNewTab,
    closeNewTab: context.closeNewTab,
  };
}

import { use } from 'react';
import { DocumentContext } from './context';
import type { DocumentContextValue } from './document-context-types';

export type DocumentPanels = Pick<
  DocumentContextValue,
  | 'docPanelMode'
  | 'docPanelAgentId'
  | 'docPanelExpandSignal'
  | 'openActivityPanel'
  | 'closeActivityPanel'
>;

/** Right-rail panel contract. Overlay state must not be part of table/editor identity. */
export function useDocumentPanels(): DocumentPanels {
  const context = use(DocumentContext);
  if (!context) throw new Error('useDocumentPanels must be used within <DocumentProvider />');
  return {
    docPanelMode: context.docPanelMode,
    docPanelAgentId: context.docPanelAgentId,
    docPanelExpandSignal: context.docPanelExpandSignal,
    openActivityPanel: context.openActivityPanel,
    closeActivityPanel: context.closeActivityPanel,
  };
}

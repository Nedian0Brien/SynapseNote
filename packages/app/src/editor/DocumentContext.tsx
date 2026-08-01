import { type ReactNode, use } from 'react';
import { DocumentContext } from './document-context/context';
import { DocumentProviderComposition } from './document-context/DocumentProviderComposition';
import type {
  DocumentContextValue,
  OpenTargetOptions,
} from './document-context/document-context-types';

export type {
  CloseTabsOptions,
  DocumentContextValue,
  OpenTargetOptions,
  PoolEntrySnapshot,
} from './document-context/document-context-types';

/**
 * Render owner: this compatibility facade. State owner: document-context runtime.
 * The provider deliberately only composes the state/runtime boundary and context.
 */
export function DocumentProvider({ children }: { children: ReactNode }) {
  return <DocumentProviderComposition>{children}</DocumentProviderComposition>;
}

export function useDocumentContext(): DocumentContextValue {
  const context = use(DocumentContext);
  if (!context) throw new Error('useDocumentContext must be used within <DocumentProvider />');
  return context;
}

export function useOptionalDocumentContext(): DocumentContextValue | null {
  return use(DocumentContext);
}

export function useDocumentTransition(): {
  openDocumentTransition: (docName: string) => void;
  openTargetTransition: (
    target: import('@/components/navigation-targets').ResolvedNavigationTarget,
    options?: OpenTargetOptions,
  ) => void;
} {
  const { openDocumentTransition, openTargetTransition } = useDocumentContext();
  return { openDocumentTransition, openTargetTransition };
}

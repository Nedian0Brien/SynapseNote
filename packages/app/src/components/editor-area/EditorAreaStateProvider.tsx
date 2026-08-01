import {
  createContext,
  type ReactNode,
  use,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useDocumentTransition } from '@/editor/DocumentContext';
import { useDocumentCollaboration } from '@/editor/document-context/useDocumentCollaboration';
import { useDocumentNavigation } from '@/editor/document-context/useDocumentNavigation';
import { useDocumentPanels } from '@/editor/document-context/useDocumentPanels';
import { docNameFromHash, hashFromDocName } from '@/lib/doc-hash';
import {
  matchesShareReceiveMiss,
  pendingReceiveNavStore,
} from '@/lib/share/pending-receive-nav-store';
import type { EditorAreaProps } from './types';
import { type EditorAreaRightRail, useEditorAreaRightRail } from './useEditorAreaRightRail';

type Navigation = ReturnType<typeof useDocumentNavigation>;
type Collaboration = ReturnType<typeof useDocumentCollaboration>;
type Panels = ReturnType<typeof useDocumentPanels>;

export interface ResolvedEditorAreaProps extends EditorAreaProps {
  readonly terminalVisible: boolean;
  readonly terminalDock: 'right' | 'bottom';
}

export interface EditorAreaState extends Navigation, Collaboration, Panels {
  readonly props: ResolvedEditorAreaProps;
  readonly rail: EditorAreaRightRail;
  readonly deferredActiveDocName: string | null;
  readonly everHadProvider: boolean;
  readonly shareReceiveMiss: ReturnType<typeof matchesShareReceiveMiss>;
  readonly previousDocName: string | null;
  readonly composerDismissed: boolean;
  setComposerDismissed: (dismissed: boolean) => void;
  navigateBackToDoc: (docName: string) => void;
}

const EditorAreaStateContext = createContext<EditorAreaState | null>(null);

/** State owner for document navigation, view history, and right-rail actions. */
export function EditorAreaStateProvider({
  children,
  ...inputProps
}: EditorAreaProps & { children: ReactNode }) {
  const props: ResolvedEditorAreaProps = {
    ...inputProps,
    terminalVisible: inputProps.terminalVisible ?? false,
    terminalDock: inputProps.terminalDock ?? 'right',
  };
  const navigation = useDocumentNavigation();
  const collaboration = useDocumentCollaboration();
  const panels = useDocumentPanels();
  const { openDocumentTransition } = useDocumentTransition();
  const { activeDocName, activeTarget } = navigation;
  const { activeProvider } = collaboration;
  const [everHadProvider, setEverHadProvider] = useState(false);
  useEffect(() => {
    if (activeProvider != null && !everHadProvider) setEverHadProvider(true);
  }, [activeProvider, everHadProvider]);
  const deferredActiveDocName = useDeferredValue(activeDocName);
  const pendingReceiveNav = useSyncExternalStore(
    pendingReceiveNavStore.subscribe,
    pendingReceiveNavStore.getSnapshot,
    pendingReceiveNavStore.getSnapshot,
  );
  const shareReceiveMiss = matchesShareReceiveMiss(activeTarget, pendingReceiveNav);
  const rail = useEditorAreaRightRail({
    terminalBridge: props.terminalBridge,
    terminalVisible: props.terminalVisible,
    terminalDock: props.terminalDock,
    onTerminalVisibleChange: props.onTerminalVisibleChange,
    docPanelExpandSignal: panels.docPanelExpandSignal,
    onActiveTabChange: props.onActiveTabChange,
  });

  const activeTerminalContainer =
    rail.terminalDockPosition === 'right' &&
    props.terminalVisible &&
    rail.rightTerminalContainer != null
      ? rail.rightTerminalContainer
      : rail.bottomTerminalContainer;
  const terminalShowing =
    (rail.terminalDockPosition === 'right'
      ? props.terminalVisible && rail.rightTerminalContainer != null
      : props.terminalVisible) && activeTerminalContainer != null;
  useEffect(() => {
    props.onTerminalPlacement?.({
      container: activeTerminalContainer,
      isShowing: terminalShowing,
      dockPosition: rail.terminalDockPosition,
      editorRegion: rail.terminalEditorRegion,
    });
  }, [
    props.onTerminalPlacement,
    activeTerminalContainer,
    terminalShowing,
    rail.terminalDockPosition,
    rail.terminalEditorRegion,
  ]);

  const previousDocNameRef = useRef<string | null>(null);
  const [previousDocName, setPreviousDocName] = useState<string | null>(null);
  const [composerDismissed, setComposerDismissed] = useState(false);
  const historyName = activeTarget?.kind === 'large-file' ? activeTarget.docName : activeDocName;
  useEffect(() => {
    if (historyName && historyName !== previousDocNameRef.current) {
      const prior = previousDocNameRef.current;
      previousDocNameRef.current = historyName;
      setPreviousDocName(prior);
    }
  }, [historyName]);
  const navigateBackToDoc = (docName: string) => {
    const hash = hashFromDocName(docName);
    if (window.location.hash === hash) openDocumentTransition(docName);
    else window.location.hash = hash;
  };

  return (
    <EditorAreaStateContext.Provider
      value={{
        ...navigation,
        ...collaboration,
        ...panels,
        props,
        rail,
        deferredActiveDocName,
        everHadProvider,
        shareReceiveMiss,
        previousDocName,
        composerDismissed,
        setComposerDismissed,
        navigateBackToDoc,
      }}
    >
      {children}
    </EditorAreaStateContext.Provider>
  );
}

export function useEditorAreaState(): EditorAreaState {
  const state = use(EditorAreaStateContext);
  if (state == null) throw new Error('EditorArea state is missing its provider');
  return state;
}

/** Isolated so the cold-navigation guard remains a named, testable view decision. */
export function hasHashNavigationTarget(): boolean {
  return typeof window !== 'undefined' && docNameFromHash(window.location.hash) !== null;
}

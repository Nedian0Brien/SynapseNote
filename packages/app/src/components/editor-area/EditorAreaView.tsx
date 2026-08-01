import type { ReactNode } from 'react';
import { AssetPreview } from '@/components/AssetPreview';
import { EmptyEditorState } from '@/components/EmptyEditorState';
import { FolderOverview } from '@/components/FolderOverview';
import { LargeFileEditorState } from '@/components/LargeFileEditorState';
import { ShareReceiveMissPanel } from '@/components/ShareReceiveMissPanel';
import { SkillFileViewer } from '@/components/SkillFileViewer';
import { BottomComposer } from '../BottomComposer';
import { shouldShowFolderComposer } from '../bottom-composer-gate';
import { EditorSkeleton } from '../EditorSkeleton';
import { EditorAreaDocumentSurface } from './EditorAreaDocumentSurface';
import {
  EditorAreaDocumentRightPanel,
  EditorAreaFolderAgentPanel,
  EditorAreaPdfRightPanel,
  EditorAreaSkeletonRightPanel,
} from './EditorAreaRightPanels';
import { hasHashNavigationTarget, useEditorAreaState } from './EditorAreaStateProvider';

/** Render owner for active-target branches: documents, folders, assets, and share verdicts. */
export function EditorAreaPrimaryView() {
  const {
    props,
    rail,
    activeTarget,
    activeProvider,
    activeDocName,
    previousDocName,
    navigateBackToDoc,
    shareReceiveMiss,
  } = useEditorAreaState();
  if (activeTarget?.kind === 'large-file') {
    return (
      <LargeFileEditorState
        docName={activeTarget.docName}
        size={activeTarget.size}
        limit={activeTarget.limit}
        backNav={
          previousDocName ? { previousDocName, onNavigateBack: navigateBackToDoc } : undefined
        }
      />
    );
  }
  if (activeTarget?.kind === 'folder') {
    const showComposer = shouldShowFolderComposer({
      terminalVisible: props.terminalVisible,
      isEmbedded: rail.isEmbedded,
    });
    return (
      <div className="relative flex h-full min-h-0 flex-col">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <FolderOverview folderPath={activeTarget.folderPath} />
          {showComposer ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-linear-to-t from-background to-transparent"
            />
          ) : null}
        </div>
        {showComposer ? <BottomComposer folderPath={activeTarget.folderPath} /> : null}
      </div>
    );
  }
  if (activeTarget?.kind === 'asset') {
    const isPdf = activeTarget.mediaKind === 'pdf';
    const activePdfPanelTab =
      props.activeTab === 'pages' ||
      props.activeTab === 'annotations' ||
      props.activeTab === 'outline' ||
      props.activeTab === 'links'
        ? props.activeTab
        : 'pages';
    return (
      <AssetPreview
        key={activeTarget.assetPath}
        assetPath={activeTarget.assetPath}
        mediaKind={activeTarget.mediaKind}
        rightPanelOpen={rail.terminalColumnPresent || (isPdf && !rail.isCollapsed)}
        onToggleRightPanel={
          isPdf && props.terminalBridge != null ? rail.toggleDocumentRightPanel : undefined
        }
        pdfPanelContainer={rail.pdfPanelContainer}
        activePdfPanelTab={activePdfPanelTab}
      />
    );
  }
  if (activeTarget?.kind === 'skill-file') {
    return (
      <SkillFileViewer
        key={`${activeTarget.scope}/${activeTarget.name}/${activeTarget.path}`}
        scope={activeTarget.scope}
        name={activeTarget.name}
        path={activeTarget.path}
      />
    );
  }
  if (shareReceiveMiss)
    return <ShareReceiveMissPanel key={shareReceiveMiss.path} nav={shareReceiveMiss} />;
  if (activeProvider == null || activeDocName == null) {
    if (hasHashNavigationTarget()) return <EditorSkeleton />;
    return (
      <EmptyEditorState terminalDock={props.terminalVisible ? rail.terminalDockPosition : null} />
    );
  }
  return <EditorAreaDocumentSurface />;
}

/** Render owner for the right panel selected by the same active-target branch. */
export function EditorAreaViewRightPanel(): ReactNode {
  const { activeTarget, activeProvider, activeDocName, shareReceiveMiss } = useEditorAreaState();
  if (activeTarget?.kind === 'folder') return <EditorAreaFolderAgentPanel />;
  if (activeTarget?.kind === 'asset') {
    return activeTarget.mediaKind === 'pdf' ? <EditorAreaPdfRightPanel /> : null;
  }
  if (
    activeTarget?.kind === 'large-file' ||
    activeTarget?.kind === 'skill-file' ||
    shareReceiveMiss
  ) {
    return null;
  }
  if (activeProvider == null || activeDocName == null) {
    return hasHashNavigationTarget() ? <EditorAreaSkeletonRightPanel /> : null;
  }
  return <EditorAreaDocumentRightPanel />;
}

import { Trans, useLingui } from '@lingui/react/macro';
import { parseManagedArtifactName, type SkillScope } from '@nedian0brien/synapsenote-core';
import { ListPlus } from 'lucide-react';
import { Fragment, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { EditorModeValue } from '@/editor/use-editor-mode.ts';
import { parseProjectSkillContentDocName } from '@/lib/managed-artifact-doc-name';
import { useDatabaseRecordHeader } from '@/lib/database-record-header';
import { DocumentViewerHeader, viewerTitleFromPath } from './DocumentViewerHeader';
import { EditorModeToggle } from './EditorModeToggle';
import { ExportPdfButton } from './ExportPdfButton';
import { MarkdownFormatToolbar } from './MarkdownFormatToolbar';
import { NotInSidebarIndicator } from './NotInSidebarIndicator';

// Lazy-loaded: skill install/history chrome (+ the shared useSkillActions
// dialogs) only mounts when the active doc is a skill, so it stays out of the
// eager toolbar bundle that every document loads.
const SkillEditorActions = lazy(async () => ({
  default: (await import('./SkillEditorActions')).SkillEditorActions,
}));

interface EditorToolbarProps {
  activeDocName: string | null;
  isSourceMode: boolean;
  sourceDisabled: boolean;
  onModeChange: (mode: EditorModeValue) => void;
  showAddPropertyButton: boolean;
  onAddProperty: () => void;
  isPanelCollapsed: boolean;
  onTogglePanel: () => void;
  panelControlsId?: string;
}

export function EditorToolbar({
  activeDocName,
  isSourceMode,
  sourceDisabled,
  onModeChange,
  showAddPropertyButton,
  onAddProperty,
  isPanelCollapsed,
  onTogglePanel,
  panelControlsId = 'doc-panel',
}: EditorToolbarProps) {
  const { t } = useLingui();
  // Skills carry install/uninstall + history chrome in this per-doc toolbar
  // (templates + documents don't — only skills are installed). Install is a
  // live symlink, so there's no reinstall step.
  const managed = activeDocName ? parseManagedArtifactName(activeDocName) : null;
  // Skills carry the install chrome whether they're global (managed-artifact
  // docs) or project (content docs `.ok/skills/<name>/SKILL`) — same identity,
  // same toolbar chrome, so the two scopes aren't disconnected.
  const projectSkillName = activeDocName ? parseProjectSkillContentDocName(activeDocName) : null;
  const activeSkill: { scope: SkillScope; name: string } | null =
    managed?.kind === 'skill'
      ? { scope: managed.scope, name: managed.name }
      : projectSkillName
        ? { scope: 'project', name: projectSkillName }
        : null;
  const databaseRecordHeader = useDatabaseRecordHeader(activeDocName);
  const title =
    activeSkill?.name ??
    databaseRecordHeader?.recordTitle ??
    viewerTitleFromPath(activeDocName ?? 'Untitled');
  const databaseBreadcrumbSegments = databaseRecordHeader
    ? databaseRecordHeader.databaseName.trim().toLowerCase() ===
      databaseRecordHeader.sourceName.trim().toLowerCase()
      ? [
          {
            label: databaseRecordHeader.sourceName,
            href: databaseRecordHeader.sourceHref,
          },
        ]
      : [
          {
            label: databaseRecordHeader.databaseName,
            href: databaseRecordHeader.databaseHref,
          },
          {
            label: databaseRecordHeader.sourceName,
            href: databaseRecordHeader.sourceHref,
          },
        ]
    : undefined;

  return (
    <div data-testid="editor-toolbar" className="pointer-events-none absolute inset-x-0 top-0 z-10">
      <DocumentViewerHeader
        documentPath={activeDocName ?? title}
        title={title}
        fileType="MD"
        showBreadcrumb={!activeSkill}
        breadcrumbSegments={databaseBreadcrumbSegments}
        leadingAccessory={
          activeDocName === null ? null : (
            <NotInSidebarIndicator
              entry={{ kind: 'document', docName: activeDocName }}
              className="shrink-0"
            />
          )
        }
        actions={
          <Fragment>
            {activeSkill ? (
              <Suspense fallback={null}>
                <SkillEditorActions scope={activeSkill.scope} name={activeSkill.name} />
              </Suspense>
            ) : null}
            <ExportPdfButton docName={activeDocName && !managed ? activeDocName : null} />
            {showAddPropertyButton ? (
              <Tooltip>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t`Add properties`}
                  onClick={onAddProperty}
                  data-testid="add-properties-button"
                  asChild
                >
                  <TooltipTrigger>
                    <ListPlus />
                  </TooltipTrigger>
                </Button>
                <TooltipContent side="bottom">
                  <Trans>Add properties</Trans>
                </TooltipContent>
              </Tooltip>
            ) : null}
          </Fragment>
        }
        panelToggle={{
          open: !isPanelCollapsed,
          onToggle: onTogglePanel,
          controlsId: panelControlsId,
        }}
        className="pointer-events-auto"
      />
      <MarkdownFormatToolbar
        activeDocName={activeDocName}
        isSourceMode={isSourceMode}
        trailingContent={
          <EditorModeToggle
            isSourceMode={isSourceMode}
            onModeChange={onModeChange}
            sourceDisabled={sourceDisabled}
          />
        }
      />
    </div>
  );
}

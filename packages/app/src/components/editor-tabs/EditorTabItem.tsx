// biome-ignore-all lint/plugin/no-raw-html-interactive-element: pre-rule backlog — file uses raw <button> awaiting shadcn migration; tracked at https://github.com/Nedian0Brien/SynapseNote/blob/main/biome-plugins/README.md#no-raw-html-interactive-elementgrit

import { Trans, useLingui } from '@lingui/react/macro';
import { XIcon } from 'lucide-react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { parseEditorTabId, tabParts } from '@/editor/editor-tabs';
import { cn } from '@/lib/utils';
import { getTabCloseButtonClass, getTabCloseButtonTabIndex } from '../editor-tabs-chrome';
import {
  DocumentTabButton,
  TAB_BUTTON_CLASS,
  TabPinOrCloseButton,
  TabShortcutHint,
} from './EditorTabChrome';
import { TabShell } from './EditorTabShell';
import { getTabAriaKeyShortcuts, getTabShortcutHint, tabDomIdPart } from './editor-tab-model';
import type { EditorTabRenameController } from './useEditorTabRename';

interface EditorTabItemProps {
  activeNewTabId: string | null;
  activeTabId: string | null;
  activateNewTab: (tabId: string) => void;
  activateTab: (tabId: string) => void;
  closeNewTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  closeVisibleTabs: (tabIds: readonly string[]) => void;
  forceTabCloseVisible: boolean;
  newTabIdSet: ReadonlySet<string>;
  pageMeta: ReadonlyMap<string, { docExt?: string }>;
  pinTab: (tabId: string) => void;
  pinnedTabIds: readonly string[];
  rename: EditorTabRenameController;
  tabId: string;
  tabIndex: number;
  unpinTab: (tabId: string) => void;
  visibleTabIds: readonly string[];
}

function NewTabItem({
  activeNewTabId,
  activateNewTab,
  closeNewTab,
  closeVisibleTabs,
  forceTabCloseVisible,
  pinTab,
  pinnedTabIds,
  shortcutHint,
  tabId,
  unpinTab,
  visibleTabIds,
}: EditorTabItemProps & { shortcutHint: string | null }) {
  const { t } = useLingui();
  const isActive = tabId === activeNewTabId;
  return (
    <TabShell
      active={isActive}
      activateFromKeyboard={() => activateNewTab(tabId)}
      canPin={false}
      closeTab={closeNewTab}
      closeVisibleTabs={closeVisibleTabs}
      onActivate={() => activateNewTab(tabId)}
      openTabs={visibleTabIds}
      pinnedTabIds={pinnedTabIds}
      pinTab={pinTab}
      tabId={tabId}
      unpinTab={unpinTab}
    >
      <button
        type="button"
        aria-label={t`Activate new tab`}
        data-testid="editor-new-tab-placeholder-button"
        className={TAB_BUTTON_CLASS}
        onClick={() => activateNewTab(tabId)}
        tabIndex={-1}
      >
        <span className="min-w-0 truncate">
          <Trans>New tab</Trans>
        </span>
      </button>
      {shortcutHint ? (
        <TabShortcutHint value={shortcutHint} />
      ) : (
        <button
          type="button"
          aria-label={t`Close new tab`}
          data-testid="editor-new-tab-placeholder-close"
          className={getTabCloseButtonClass(forceTabCloseVisible || isActive)}
          tabIndex={getTabCloseButtonTabIndex(isActive)}
          onClick={(event) => {
            event.stopPropagation();
            closeNewTab(tabId);
          }}
        >
          <XIcon aria-hidden="true" className="size-3.5" />
        </button>
      )}
    </TabShell>
  );
}

function ReadOnlyTabItem({
  activeTabId,
  activateTab,
  closeTab,
  closeVisibleTabs,
  forceTabCloseVisible,
  isFolder,
  pinTab,
  pinnedTabIds,
  shortcutHint,
  tabId,
  tabIndex,
  unpinTab,
  visibleTabIds,
}: EditorTabItemProps & { isFolder: boolean; shortcutHint: string | null }) {
  const tab = parseEditorTabId(tabId);
  const path =
    isFolder && tab.kind === 'folder'
      ? tab.folderPath
      : tab.kind === 'asset'
        ? tab.assetPath
        : tab.kind === 'skill-file'
          ? tab.path
          : '';
  const { baseName, label, prefix } = tabParts(path, isFolder ? '/' : '');
  const accessibleLabel = `${prefix}${label}`;
  const isActive = tabId === activeTabId;
  const isPinned = pinnedTabIds.includes(tabId);
  return (
    <TabShell
      active={isActive}
      activateFromKeyboard={() => activateTab(tabId)}
      closeTab={closeTab}
      closeVisibleTabs={closeVisibleTabs}
      isPinned={isPinned}
      onActivate={() => activateTab(tabId)}
      openTabs={visibleTabIds}
      pinnedTabIds={pinnedTabIds}
      pinTab={pinTab}
      tabId={tabId}
      unpinTab={unpinTab}
      ariaKeyShortcuts={getTabAriaKeyShortcuts(tabIndex, visibleTabIds.length)}
    >
      <button
        type="button"
        aria-label={accessibleLabel}
        title={isFolder ? accessibleLabel : undefined}
        className={TAB_BUTTON_CLASS}
        onClick={() => activateTab(tabId)}
        tabIndex={-1}
      >
        {isFolder ? (
          <>
            {prefix && (
              <span className={cn('min-w-0 flex-1 truncate', isActive && 'text-muted-foreground')}>
                {prefix}
              </span>
            )}
            <span
              className={cn(
                'flex min-w-0 items-center',
                prefix ? 'max-w-[70%] shrink-0' : 'flex-1',
              )}
            >
              <span className="min-w-0 truncate">{baseName}</span>
              <span className="shrink-0">/</span>
            </span>
          </>
        ) : (
          <>
            {prefix ? (
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-muted-foreground/60',
                  isActive && 'text-muted-foreground',
                )}
              >
                {prefix}
              </span>
            ) : null}
            <span className={cn('min-w-0 truncate', prefix ? 'max-w-[70%] shrink-0' : 'flex-1')}>
              {baseName}
            </span>
          </>
        )}
      </button>
      <TabPinOrCloseButton
        accessibleLabel={accessibleLabel}
        closeTab={closeTab}
        forceCloseVisible={forceTabCloseVisible}
        isActive={isActive}
        isPinned={isPinned}
        shortcutHint={shortcutHint}
        tabId={tabId}
        unpinTab={unpinTab}
      />
    </TabShell>
  );
}

function DocumentTabItem({
  activeTabId,
  activateTab,
  closeTab,
  closeVisibleTabs,
  forceTabCloseVisible,
  pageMeta,
  pinTab,
  pinnedTabIds,
  rename,
  shortcutHint,
  tabId,
  tabIndex,
  unpinTab,
  visibleTabIds,
}: EditorTabItemProps & { shortcutHint: string | null }) {
  const { t } = useLingui();
  const {
    cancelRename,
    commitRename,
    enterRenameMode,
    isRenameLoading,
    renameError,
    renameInputRef,
    renameValue,
    renamingTab,
    updateRenameValue,
  } = rename;
  const tab = parseEditorTabId(tabId);
  if (tab.kind !== 'doc') return null;
  const docName = tab.docName;
  const docExt = pageMeta.get(docName)?.docExt ?? '.md';
  const { baseName, extension, label, prefix } = tabParts(docName, docExt);
  const accessibleLabel = `${prefix}${label}`;
  const isActive = tabId === activeTabId;
  const isPinned = pinnedTabIds.includes(tabId);
  const isRenaming = renamingTab?.tabId === tabId;
  const renameErrorId = `editor-tab-rename-error-${tabDomIdPart(docName)}`;
  return (
    <TabShell
      active={isActive}
      activateFromKeyboard={() => activateTab(tabId)}
      closeTab={closeTab}
      closeVisibleTabs={closeVisibleTabs}
      disabled={isRenaming}
      isPinned={isPinned}
      onActivate={() => activateTab(tabId)}
      openTabs={visibleTabIds}
      pinnedTabIds={pinnedTabIds}
      pinTab={pinTab}
      renameError={renameError}
      tabId={tabId}
      unpinTab={unpinTab}
      ariaKeyShortcuts={getTabAriaKeyShortcuts(tabIndex, visibleTabIds.length)}
    >
      {isRenaming ? (
        <>
          <InputGroup className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent dark:bg-transparent">
            <InputGroupInput
              ref={renameInputRef}
              value={renameValue}
              disabled={isRenameLoading}
              aria-label={t({ message: `Rename ${label}` })}
              data-testid="editor-tab-rename-input"
              aria-invalid={renameError ? true : undefined}
              aria-describedby={renameError ? renameErrorId : undefined}
              aria-busy={isRenameLoading || undefined}
              title={renameError ?? docName}
              className="h-full min-w-0 px-2 py-0 font-medium text-foreground text-xs selection:bg-primary selection:text-primary-foreground"
              onChange={(event) => {
                updateRenameValue(event.target.value, docExt);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void commitRename();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelRename();
                }
              }}
              onBlur={commitRename}
            />
            <InputGroupAddon align="inline-end" aria-hidden="true" className="pr-2 text-xs">
              <InputGroupText className="text-muted-foreground/60 text-xs">{docExt}</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          {renameError ? (
            <span id={renameErrorId} role="alert" className="sr-only">
              {renameError}
            </span>
          ) : null}
        </>
      ) : (
        <>
          <DocumentTabButton
            accessibleLabel={accessibleLabel}
            activateTab={activateTab}
            baseName={baseName}
            docName={docName}
            enterRenameMode={enterRenameMode}
            extension={extension}
            hideDocExtension={docExt === '.md' || docExt === '.mdx'}
            tabId={tabId}
          />
          <TabPinOrCloseButton
            accessibleLabel={accessibleLabel}
            closeTab={closeTab}
            forceCloseVisible={forceTabCloseVisible}
            isActive={isActive}
            isPinned={isPinned}
            shortcutHint={shortcutHint}
            tabId={tabId}
            unpinTab={unpinTab}
          />
        </>
      )}
    </TabShell>
  );
}

export function EditorTabItem({
  activeNewTabId,
  activeTabId,
  activateNewTab,
  activateTab,
  closeNewTab,
  closeTab,
  closeVisibleTabs,
  forceTabCloseVisible,
  newTabIdSet,
  pageMeta,
  pinTab,
  pinnedTabIds,
  rename,
  tabId,
  tabIndex,
  unpinTab,
  visibleTabIds,
}: EditorTabItemProps) {
  const shortcutHint = forceTabCloseVisible
    ? getTabShortcutHint(tabIndex, visibleTabIds.length)
    : null;
  const itemProps = {
    activeNewTabId,
    activeTabId,
    activateNewTab,
    activateTab,
    closeNewTab,
    closeTab,
    closeVisibleTabs,
    forceTabCloseVisible,
    newTabIdSet,
    pageMeta,
    pinTab,
    pinnedTabIds,
    rename,
    tabId,
    tabIndex,
    unpinTab,
    visibleTabIds,
    shortcutHint,
  };
  if (newTabIdSet.has(tabId)) return <NewTabItem {...itemProps} />;
  const tab = parseEditorTabId(tabId);
  if (tab.kind === 'folder') return <ReadOnlyTabItem {...itemProps} isFolder />;
  if (tab.kind === 'asset' || tab.kind === 'skill-file') {
    return <ReadOnlyTabItem {...itemProps} isFolder={false} />;
  }
  return <DocumentTabItem {...itemProps} />;
}

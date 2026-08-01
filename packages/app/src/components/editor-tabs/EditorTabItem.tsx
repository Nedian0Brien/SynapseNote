// biome-ignore-all lint/plugin/no-raw-html-interactive-element: pre-rule backlog — file uses raw <button> awaiting shadcn migration; tracked at https://github.com/Nedian0Brien/SynapseNote/blob/main/biome-plugins/README.md#no-raw-html-interactive-elementgrit

import { Trans, useLingui } from '@lingui/react/macro';
import { XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
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
  EditorTabContextMenu,
  SortableTab,
  TAB_ACTIVE_CLASS,
  TAB_BASE_CLASS,
  TAB_BUTTON_CLASS,
  TAB_INACTIVE_CLASS,
  TabPinOrCloseButton,
  TabShortcutHint,
} from './EditorTabChrome';
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

function TabShell({
  activateFromKeyboard,
  active,
  canPin = true,
  children,
  closeTab,
  closeVisibleTabs,
  disabled = false,
  isPinned = false,
  onActivate,
  openTabs,
  tabId,
  pinnedTabIds,
  pinTab,
  unpinTab,
  ariaKeyShortcuts,
  renameError,
}: {
  activateFromKeyboard: () => void;
  active: boolean;
  ariaKeyShortcuts?: string;
  canPin?: boolean;
  children: ReactNode;
  closeTab: (tabId: string) => void;
  closeVisibleTabs: (tabIds: readonly string[]) => void;
  disabled?: boolean;
  isPinned?: boolean;
  onActivate: () => void;
  openTabs: readonly string[];
  pinnedTabIds: readonly string[];
  pinTab: (tabId: string) => void;
  renameError?: string | null;
  tabId: string;
  unpinTab: (tabId: string) => void;
}) {
  return (
    <EditorTabContextMenu
      tabId={tabId}
      canPin={canPin}
      disabled={disabled}
      openTabs={openTabs}
      closeTab={closeTab}
      closeTabs={closeVisibleTabs}
      pinTab={pinTab}
      pinnedTabIds={pinnedTabIds}
      unpinTab={unpinTab}
    >
      <SortableTab
        tabId={tabId}
        activateFromKeyboard={activateFromKeyboard}
        disabled={disabled}
        aria-current={active ? 'page' : undefined}
        aria-keyshortcuts={ariaKeyShortcuts}
        data-active-tab={active ? 'true' : undefined}
        className={cn(
          TAB_BASE_CLASS,
          active ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS,
          disabled && renameError && 'border-destructive',
        )}
        onAuxClick={(event) => {
          if (event.button !== 1) return;
          event.preventDefault();
          if (!canPin || !isPinned) closeTab(tabId);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) onActivate();
        }}
      >
        {children}
      </SortableTab>
    </EditorTabContextMenu>
  );
}

function NewTabItem(props: EditorTabItemProps & { shortcutHint: string | null }) {
  const { t } = useLingui();
  const { activeNewTabId, activateNewTab, closeNewTab, forceTabCloseVisible, shortcutHint, tabId } =
    props;
  const isActive = tabId === activeNewTabId;
  return (
    <TabShell
      {...props}
      active={isActive}
      activateFromKeyboard={() => activateNewTab(tabId)}
      canPin={false}
      closeTab={closeNewTab}
      onActivate={() => activateNewTab(tabId)}
      openTabs={props.visibleTabIds}
      ariaKeyShortcuts={getTabAriaKeyShortcuts(props.tabIndex, props.visibleTabIds.length)}
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
  isFolder,
  props,
  shortcutHint,
}: {
  isFolder: boolean;
  props: EditorTabItemProps;
  shortcutHint: string | null;
}) {
  const tab = parseEditorTabId(props.tabId);
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
  const isActive = props.tabId === props.activeTabId;
  const isPinned = props.pinnedTabIds.includes(props.tabId);
  return (
    <TabShell
      {...props}
      active={isActive}
      activateFromKeyboard={() => props.activateTab(props.tabId)}
      closeTab={props.closeTab}
      isPinned={isPinned}
      onActivate={() => props.activateTab(props.tabId)}
      openTabs={props.visibleTabIds}
      ariaKeyShortcuts={getTabAriaKeyShortcuts(props.tabIndex, props.visibleTabIds.length)}
    >
      <button
        type="button"
        aria-label={accessibleLabel}
        title={isFolder ? accessibleLabel : undefined}
        className={TAB_BUTTON_CLASS}
        onClick={() => props.activateTab(props.tabId)}
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
        closeTab={props.closeTab}
        forceCloseVisible={props.forceTabCloseVisible}
        isActive={isActive}
        isPinned={isPinned}
        shortcutHint={shortcutHint}
        tabId={props.tabId}
        unpinTab={props.unpinTab}
      />
    </TabShell>
  );
}

function DocumentTabItem(props: EditorTabItemProps & { shortcutHint: string | null }) {
  const { t } = useLingui();
  const tab = parseEditorTabId(props.tabId);
  if (tab.kind !== 'doc') return null;
  const docName = tab.docName;
  const docExt = props.pageMeta.get(docName)?.docExt ?? '.md';
  const { baseName, extension, label, prefix } = tabParts(docName, docExt);
  const accessibleLabel = `${prefix}${label}`;
  const isActive = props.tabId === props.activeTabId;
  const isPinned = props.pinnedTabIds.includes(props.tabId);
  const isRenaming = props.rename.renamingTab?.tabId === props.tabId;
  const renameErrorId = `editor-tab-rename-error-${tabDomIdPart(docName)}`;
  return (
    <TabShell
      {...props}
      active={isActive}
      activateFromKeyboard={() => props.activateTab(props.tabId)}
      closeTab={props.closeTab}
      disabled={isRenaming}
      isPinned={isPinned}
      onActivate={() => props.activateTab(props.tabId)}
      openTabs={props.visibleTabIds}
      renameError={props.rename.renameError}
      ariaKeyShortcuts={getTabAriaKeyShortcuts(props.tabIndex, props.visibleTabIds.length)}
    >
      {isRenaming ? (
        <>
          <InputGroup className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent dark:bg-transparent">
            <InputGroupInput
              ref={props.rename.renameInputRef}
              value={props.rename.renameValue}
              disabled={props.rename.isRenameLoading}
              aria-label={t`Rename ${label}`}
              data-testid="editor-tab-rename-input"
              aria-invalid={props.rename.renameError ? true : undefined}
              aria-describedby={props.rename.renameError ? renameErrorId : undefined}
              aria-busy={props.rename.isRenameLoading || undefined}
              title={props.rename.renameError ?? docName}
              className="h-full min-w-0 px-2 py-0 font-medium text-foreground text-xs selection:bg-primary selection:text-primary-foreground"
              onChange={(event) => {
                props.rename.updateRenameValue(event.target.value, docExt);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void props.rename.commitRename();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  props.rename.cancelRename();
                }
              }}
              onBlur={props.rename.commitRename}
            />
            <InputGroupAddon align="inline-end" aria-hidden="true" className="pr-2 text-xs">
              <InputGroupText className="text-muted-foreground/60 text-xs">{docExt}</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          {props.rename.renameError ? (
            <span id={renameErrorId} role="alert" className="sr-only">
              {props.rename.renameError}
            </span>
          ) : null}
        </>
      ) : (
        <>
          <DocumentTabButton
            accessibleLabel={accessibleLabel}
            activateTab={props.activateTab}
            baseName={baseName}
            docName={docName}
            enterRenameMode={props.rename.enterRenameMode}
            extension={extension}
            hideDocExtension={docExt === '.md' || docExt === '.mdx'}
            tabId={props.tabId}
          />
          <TabPinOrCloseButton
            accessibleLabel={accessibleLabel}
            closeTab={props.closeTab}
            forceCloseVisible={props.forceTabCloseVisible}
            isActive={isActive}
            isPinned={isPinned}
            shortcutHint={props.shortcutHint}
            tabId={props.tabId}
            unpinTab={props.unpinTab}
          />
        </>
      )}
    </TabShell>
  );
}

export function EditorTabItem(props: EditorTabItemProps) {
  const shortcutHint = props.forceTabCloseVisible
    ? getTabShortcutHint(props.tabIndex, props.visibleTabIds.length)
    : null;
  if (props.newTabIdSet.has(props.tabId))
    return <NewTabItem {...props} shortcutHint={shortcutHint} />;
  const tab = parseEditorTabId(props.tabId);
  if (tab.kind === 'folder')
    return <ReadOnlyTabItem isFolder props={props} shortcutHint={shortcutHint} />;
  if (tab.kind === 'asset' || tab.kind === 'skill-file') {
    return <ReadOnlyTabItem isFolder={false} props={props} shortcutHint={shortcutHint} />;
  }
  return <DocumentTabItem {...props} shortcutHint={shortcutHint} />;
}

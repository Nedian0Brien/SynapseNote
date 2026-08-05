const FOLDER_OVERVIEW_TRIGGER_TYPE = 'folder-overview-trigger';

interface FolderOverviewButtonController {
  dispose(): void;
  sync(): void;
}

function createFolderOverviewIcon(iconId: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('data-icon-name', iconId);
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');

  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${iconId}`);
  svg.append(use);
  return svg;
}

/**
 * Pierre renders one floating action anchor for the row currently under the
 * pointer (or holding keyboard focus). Mount the folder-overview action into
 * that same anchor so it stays aligned immediately to the left of Options.
 */
export function attachFolderOverviewButton(
  shadowRoot: ShadowRoot,
  options: {
    iconId: string;
    label: string;
    onOpen: (treeDirectoryPath: string) => void;
  },
): FolderOverviewButtonController {
  let button = shadowRoot.querySelector<HTMLButtonElement>(
    `[data-type="${FOLDER_OVERVIEW_TRIGGER_TYPE}"]`,
  );

  const handleMouseDown = (event: MouseEvent) => {
    event.preventDefault();
  };
  const handleClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const treeDirectoryPath = button?.dataset.folderOverviewPath;
    if (treeDirectoryPath) options.onOpen(treeDirectoryPath);
  };

  const ensureButton = (anchor: HTMLElement): HTMLButtonElement => {
    if (button) return button;
    button = document.createElement('button');
    button.type = 'button';
    button.dataset.type = FOLDER_OVERVIEW_TRIGGER_TYPE;
    button.setAttribute('aria-label', options.label);
    button.title = options.label;
    button.tabIndex = 0;
    button.append(createFolderOverviewIcon(options.iconId));
    button.addEventListener('mousedown', handleMouseDown);
    button.addEventListener('click', handleClick);
    anchor.insertBefore(button, anchor.firstChild);
    return button;
  };

  const sync = () => {
    const anchor = shadowRoot.querySelector<HTMLElement>('[data-type="context-menu-anchor"]');
    if (!anchor) return;
    const nextButton = ensureButton(anchor);
    const activeRow =
      shadowRoot.querySelector<HTMLElement>('[data-item-context-hover="true"][data-item-path]') ??
      shadowRoot.querySelector<HTMLElement>('[data-item-focused="true"][data-item-path]');
    const treeDirectoryPath =
      activeRow?.dataset.itemType === 'folder' ? activeRow.dataset.itemPath : undefined;
    if (treeDirectoryPath) {
      if (nextButton.dataset.folderOverviewPath !== treeDirectoryPath) {
        nextButton.dataset.folderOverviewPath = treeDirectoryPath;
      }
      nextButton.hidden = false;
      return;
    }
    delete nextButton.dataset.folderOverviewPath;
    nextButton.hidden = true;
  };

  sync();
  const observer = new MutationObserver(sync);
  observer.observe(shadowRoot, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'data-item-context-hover',
      'data-item-focused',
      'data-item-path',
      'data-item-type',
    ],
  });

  return {
    dispose() {
      observer.disconnect();
      button?.removeEventListener('mousedown', handleMouseDown);
      button?.removeEventListener('click', handleClick);
      button?.remove();
      button = null;
    },
    sync,
  };
}

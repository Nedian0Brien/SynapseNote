import { afterEach, describe, expect, mock, test } from 'bun:test';
import { attachFolderOverviewButton } from './file-tree-folder-overview-button';

describe('folder overview button', () => {
  const hosts: HTMLElement[] = [];

  afterEach(() => {
    for (const host of hosts) host.remove();
    hosts.length = 0;
  });

  test('mounts before Options and opens only the hovered folder overview', () => {
    const host = document.createElement('div');
    hosts.push(host);
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });

    const folderRow = document.createElement('div');
    folderRow.dataset.itemContextHover = 'true';
    folderRow.dataset.itemPath = 'brain/external-sources/';
    folderRow.dataset.itemType = 'folder';
    const anchor = document.createElement('div');
    anchor.dataset.type = 'context-menu-anchor';
    const optionsButton = document.createElement('button');
    optionsButton.dataset.type = 'context-menu-trigger';
    optionsButton.setAttribute('aria-label', 'Options');
    anchor.append(optionsButton);
    shadow.append(folderRow, anchor);

    const onOpen = mock(() => {});
    const controller = attachFolderOverviewButton(shadow, {
      iconId: 'folder-overview-icon',
      label: 'Open folder overview',
      onOpen,
    });

    const overviewButton = shadow.querySelector<HTMLButtonElement>(
      '[data-type="folder-overview-trigger"]',
    );
    expect(overviewButton).not.toBeNull();
    expect(anchor.firstElementChild).toBe(overviewButton);
    expect(anchor.lastElementChild).toBe(optionsButton);
    expect(overviewButton?.hidden).toBe(false);
    expect(overviewButton?.tabIndex).toBe(0);
    expect(overviewButton?.getAttribute('aria-label')).toBe('Open folder overview');
    expect(overviewButton?.title).toBe('Open folder overview');
    const overviewIcon = overviewButton?.querySelector('svg');
    expect(overviewIcon?.getAttribute('height')).toBe('14');
    expect(overviewIcon?.getAttribute('width')).toBe('14');

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
    expect(overviewButton?.dispatchEvent(clickEvent)).toBe(false);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('brain/external-sources/');

    folderRow.dataset.itemType = 'file';
    controller.sync();
    expect(overviewButton?.hidden).toBe(true);
    overviewButton?.click();
    expect(onOpen).toHaveBeenCalledTimes(1);

    delete folderRow.dataset.itemContextHover;
    folderRow.dataset.itemFocused = 'true';
    folderRow.dataset.itemType = 'folder';
    controller.sync();
    expect(overviewButton?.hidden).toBe(false);

    controller.dispose();
    expect(anchor.firstElementChild).toBe(optionsButton);
  });
});

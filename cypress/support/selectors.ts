/**
 * Centralized selectors for Cypress E2E tests
 * This file encapsulates all data-testid selectors to avoid hardcoding them in tests
 */

/**
 * Helper function to create a data-testid selector
 */
function byTestId(id: string): string {
  return `[data-testid="${id}"]`;
}

/**
 * Page-related selectors
 */
export const PageSelectors = {
  // Get all page items
  items: () => cy.get(byTestId('page-item')),
  
  // Get all page names
  names: () => cy.get(byTestId('page-name')),
  
  // Get page name containing specific text
  nameContaining: (text: string) => cy.get(byTestId('page-name')).contains(text),
  
  // Get page item containing specific page name
  itemByName: (pageName: string) => {
    return cy.get(byTestId('page-name'))
      .contains(pageName)
      .first()
      .closest(byTestId('page-item'));
  },
  
  // Get more actions button for a specific page
  moreActionsButton: (pageName?: string) => {
    if (pageName) {
      return PageSelectors.itemByName(pageName)
        .find(byTestId('page-more-actions'))
        .first();  // Ensure we only get one button even if multiple exist
    }
    return cy.get(byTestId('page-more-actions'));
  },
  
  // Get new page button
  newPageButton: () => cy.get(byTestId('new-page-button')),
  
  // Get page title input
  titleInput: () => cy.get(byTestId('page-title-input')),
};

/**
 * Space-related selectors
 */
export const SpaceSelectors = {
  // Get all space items
  items: () => cy.get(byTestId('space-item')),
  
  // Get all space names
  names: () => cy.get(byTestId('space-name')),
  
  // Get space expanded indicator
  expanded: () => cy.get(byTestId('space-expanded')),
  
  // Get space by name
  itemByName: (spaceName: string) => {
    return cy.get(byTestId('space-name'))
      .contains(spaceName)
      .closest(byTestId('space-item'));
  },
  
  // Get more actions button for spaces
  moreActionsButton: () => cy.get(byTestId('inline-more-actions')),
};

/**
 * View actions popover selectors
 */
export const ViewActionSelectors = {
  // Get the popover container
  popover: () => cy.get(byTestId('view-actions-popover')),
  
  // Get delete action button
  deleteButton: () => cy.get(byTestId('view-action-delete')),
  
  // Get rename action button
  renameButton: () => cy.get(byTestId('more-page-rename')),
  
  // Get change icon action button
  changeIconButton: () => cy.get(byTestId('more-page-change-icon')),
  
  // Get open in new tab action button
  openNewTabButton: () => cy.get(byTestId('more-page-open-new-tab')),
  
  // Get duplicate button
  duplicateButton: () => cy.get(byTestId('more-page-duplicate')),
  
  // Get move to button
  moveToButton: () => cy.get(byTestId('more-page-move-to')),
};

/**
 * Modal-related selectors
 */
export const ModalSelectors = {
  // Get confirm delete button (in delete confirmation modal)
  confirmDeleteButton: () => cy.get(byTestId('confirm-delete-button')),
  
  // Get delete page confirmation modal
  deletePageModal: () => cy.get(byTestId('delete-page-confirm-modal')),
  
  // Get new page modal
  newPageModal: () => cy.get(byTestId('new-page-modal')),
  
  // Get space item in modal
  spaceItemInModal: () => cy.get(byTestId('space-item')),
};

/**
 * Helper function to trigger hover on an element to show hidden actions
 */
export function hoverToShowActions(element: Cypress.Chainable) {
  return element
    .trigger('mouseenter', { force: true })
    .trigger('mouseover', { force: true });
}

/**
 * Share/Publish-related selectors
 */
export const ShareSelectors = {
  // Share button - use first() since there might be multiple share buttons in the UI
  shareButton: () => cy.get(byTestId('share-button')).first(),
  
  // Share popover
  sharePopover: () => cy.get(byTestId('share-popover')),
  
  // Publish tab button
  publishTabButton: () => cy.get(byTestId('publish-tab-button')),
  
  // Publish switch
  publishSwitch: () => cy.get(byTestId('publish-switch')),
  
  // Publish URL input
  publishUrlInput: () => cy.get(byTestId('publish-url-input')),
  
  // Page settings button
  pageSettingsButton: () => cy.get(byTestId('page-settings-button')),
  
  // Publish settings tab
  publishSettingsTab: () => cy.get(byTestId('publish-settings-tab')),
  
  // Unpublish button
  unpublishButton: () => cy.get(byTestId('unpublish-button')),
  
  // Confirm unpublish button
  confirmUnpublishButton: () => cy.get(byTestId('confirm-unpublish-button')),
};

/**
 * Workspace-related selectors
 */
export const WorkspaceSelectors = {
  // Workspace dropdown trigger
  dropdownTrigger: () => cy.get(byTestId('workspace-dropdown-trigger')),
  
  // Workspace dropdown content
  dropdownContent: () => cy.get(byTestId('workspace-dropdown-content')),
  
  // Workspace item
  item: () => cy.get(byTestId('workspace-item')),
  
  // Workspace item name
  itemName: () => cy.get(byTestId('workspace-item-name')),
  
  // Workspace member count
  memberCount: () => cy.get(byTestId('workspace-member-count')),
};

/**
 * Sidebar-related selectors
 */
export const SidebarSelectors = {
  // Sidebar page header
  pageHeader: () => cy.get(byTestId('sidebar-page-header')),
};

/**
 * Helper function to wait for React to re-render after state changes
 */
export function waitForReactUpdate(ms: number = 500) {
  return cy.wait(ms);
}
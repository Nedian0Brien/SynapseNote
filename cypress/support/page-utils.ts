/**
 * Page utilities for Cypress E2E tests
 * Provides reusable functions to interact with page elements using data-testid attributes
 */

export class PageUtils {
  // ========== Navigation & Sidebar ==========

  /**
   * Click the New Page button in the sidebar
   */
  static clickNewPageButton() {
    return cy.get('[data-testid="new-page-button"]').click();
  }

  /**
   * Get all space items in the outline
   */
  static getSpaceItems() {
    return cy.get('[data-testid="space-item"]');
  }

  /**
   * Click on a specific space item by index
   */
  static clickSpaceItem(index: number = 0) {
    return this.getSpaceItems().eq(index).click();
  }

  /**
   * Get a space by its view ID
   */
  static getSpaceById(viewId: string) {
    return cy.get(`[data-testid="space-${viewId}"]`);
  }

  /**
   * Get all space names
   */
  static getSpaceNames() {
    return cy.get('[data-testid="space-name"]');
  }

  /**
   * Get a specific space name by text
   */
  static getSpaceByName(name: string) {
    return cy.get('[data-testid="space-name"]').contains(name);
  }

  /**
   * Click on a space to expand/collapse it
   */
  static clickSpace(spaceName?: string) {
    if (spaceName) {
      return this.getSpaceByName(spaceName).parent().parent().click();
    }
    return this.getSpaceNames().first().parent().parent().click();
  }

  // ========== Page Management ==========

  /**
   * Get all page names in the outline
   */
  static getPageNames() {
    return cy.get('[data-testid="page-name"]');
  }

  /**
   * Get a specific page by name
   */
  static getPageByName(name: string) {
    return cy.get('[data-testid="page-name"]').contains(name);
  }

  /**
   * Click on a page by name
   */
  static clickPageByName(name: string) {
    return this.getPageByName(name).click();
  }

  /**
   * Get a page by its view ID
   */
  static getPageById(viewId: string) {
    return cy.get(`[data-testid="page-${viewId}"]`);
  }

  /**
   * Get the page title input field (in modal/editor)
   */
  static getPageTitleInput() {
    return cy.get('[data-testid="page-title-input"]');
  }

  /**
   * Enter a page title in the input field
   */
  static enterPageTitle(title: string) {
    return this.getPageTitleInput()
      .should('be.visible')
      .first()  // Use first() to ensure we only interact with one element
      .focus()
      .clear()
      .type(title);
  }

  /**
   * Save page title and close modal (press Escape)
   */
  static savePageTitle() {
    return this.getPageTitleInput().first().type('{esc}');
  }

  // ========== Page Actions ==========

  /**
   * Click the More Actions button for the current page
   */
  static clickPageMoreActions() {
    return cy.get('[data-testid="page-more-actions"]').click();
  }

  /**
   * Click the Delete Page button
   */
  static clickDeletePageButton() {
    return cy.get('[data-testid="delete-page-button"]').click();
  }

  /**
   * Confirm page deletion in modal (if present)
   */
  static confirmPageDeletion() {
    return cy.get('body').then($body => {
      if ($body.find('[data-testid="delete-page-confirm-modal"]').length > 0) {
        cy.get('[data-testid="delete-page-confirm-modal"]').within(() => {
          cy.contains('button', 'Delete').click();
        });
      }
    });
  }

  /**
   * Delete a page by name (complete flow)
   */
  static deletePageByName(pageName: string) {
    this.clickPageByName(pageName);
    cy.wait(1000);
    this.clickPageMoreActions();
    cy.wait(500);
    this.clickDeletePageButton();
    cy.wait(500);
    this.confirmPageDeletion();
    return cy.wait(2000);
  }

  // ========== Modal & Dialog ==========

  /**
   * Get the modal/dialog element
   */
  static getModal() {
    return cy.get('[role="dialog"]');
  }

  /**
   * Click Add button in modal
   */
  static clickModalAddButton() {
    return this.getModal().within(() => {
      cy.contains('button', 'Add').click();
    });
  }

  /**
   * Select first space in modal and click Add
   */
  static selectFirstSpaceInModal() {
    return this.getModal().should('be.visible').within(() => {
      this.clickSpaceItem(0);
      cy.contains('button', 'Add').click();
    });
    // Note: The dialog doesn't close, it transitions to show the page editor
  }

  /**
   * Select a specific space by name in modal and click Add
   */
  static selectSpace(spaceName: string = 'General') {
    return this.getModal().should('be.visible').within(($modal) => {
      // First check what elements exist in the modal
      const spaceNameElements = $modal.find('[data-testid="space-name"]');
      const spaceItemElements = $modal.find('[data-testid="space-item"]');

      if (spaceNameElements.length > 0) {
        // Log all available spaces
        cy.task('log', `Looking for space: "${spaceName}"`);
        cy.task('log', 'Available spaces with space-name:');
        spaceNameElements.each((index, elem) => {
          cy.task('log', `  - "${elem.textContent}"`);
        });

        // Try to find and click the target space
        cy.get('[data-testid="space-name"]').contains(spaceName).click();
      } else if (spaceItemElements.length > 0) {
        // If no space-name elements but space-item elements exist
        cy.task('log', `Found ${spaceItemElements.length} space-item elements but no space-name elements`);
        // Check if any space-item contains the target space name
        let foundSpace = false;
        spaceItemElements.each((index, item) => {
          if (item.textContent && item.textContent.includes(spaceName)) {
            foundSpace = true;
            cy.get('[data-testid="space-item"]').eq(index).click();
            return false; // break the loop
          }
        });

        if (!foundSpace) {
          cy.task('log', `Space "${spaceName}" not found, clicking first space-item as fallback`);
          cy.get('[data-testid="space-item"]').first().click();
        }
      } else {
        // Debug: log what's actually in the modal
        const allTestIds = $modal.find('[data-testid]');
        cy.task('log', 'No space elements found. Available data-testid elements in modal:');
        allTestIds.each((index, elem) => {
          const testId = elem.getAttribute('data-testid');
          if (testId && index < 20) { // Limit output
            cy.task('log', `  - ${testId}: "${elem.textContent?.slice(0, 50)}"`);
          }
        });

        // As a last resort, try to find any clickable element that might be a space
        cy.task('log', 'Attempting to find any clickable space element...');
        // Try to click the first item that looks like it could be a space
        cy.get('[role="button"], [role="option"], .clickable, button').first().click();
      }

      // Click the Add button
      cy.contains('button', 'Add').click();
    });
    // Note: The dialog doesn't close, it transitions to show the page editor
  }

  // ========== Workspace ==========

  /**
   * Get the workspace dropdown trigger
   */
  static getWorkspaceDropdownTrigger() {
    return cy.get('[data-testid="workspace-dropdown-trigger"]');
  }

  /**
   * Click to open workspace dropdown
   */
  static openWorkspaceDropdown() {
    return this.getWorkspaceDropdownTrigger().click();
  }

  /**
   * Get workspace list container
   */
  static getWorkspaceList() {
    return cy.get('[data-testid="workspace-list"]');
  }

  /**
   * Get all workspace items
   */
  static getWorkspaceItems() {
    return cy.get('[data-testid="workspace-item"]');
  }

  /**
   * Get workspace member count elements
   */
  static getWorkspaceMemberCounts() {
    return cy.get('[data-testid="workspace-member-count"]');
  }

  /**
   * Get user email in dropdown
   */
  static getUserEmailInDropdown() {
    return cy.get('[data-testid="user-email"]');
  }

  // ========== Editor & Content ==========

  /**
   * Get the editor element by view ID
   */
  static getEditor(viewId?: string) {
    if (viewId) {
      return cy.get(`#editor-${viewId}`);
    }
    // Get any editor (when there's only one)
    return cy.get('[id^="editor-"]').first();
  }

  /**
   * Type content in the editor
   */
  static typeInEditor(content: string) {
    return this.getEditor()
      .should('be.visible')
      .focus()
      .type(content);
  }

  /**
   * Type multiple lines in the editor
   */
  static typeMultipleLinesInEditor(lines: string[]) {
    return this.getEditor()
      .should('be.visible')
      .focus()
      .then($editor => {
        lines.forEach((line, index) => {
          if (index > 0) {
            cy.wrap($editor).type('{enter}');
          }
          cy.wrap($editor).type(line);
        });
      });
  }

  /**
   * Get editor content as text
   */
  static getEditorContent() {
    return this.getEditor().invoke('text');
  }

  /**
   * Verify editor contains specific text
   */
  static verifyEditorContains(text: string) {
    return this.getEditor().should('contain', text);
  }

  /**
   * Clear editor content
   */
  static clearEditor() {
    return this.getEditor()
      .focus()
      .type('{selectall}{backspace}');
  }

  // ========== Utility Functions ==========

  /**
   * Wait for page to load after navigation
   */
  static waitForPageLoad(timeout: number = 3000) {
    return cy.wait(timeout);
  }

  /**
   * Verify a page exists by name
   */
  static verifyPageExists(pageName: string) {
    return this.getPageByName(pageName).should('exist');
  }

  /**
   * Verify a page does not exist by name
   */
  static verifyPageNotExists(pageName: string) {
    return cy.get('body').then($body => {
      if ($body.find('[data-testid="page-name"]').length > 0) {
        cy.get('[data-testid="page-name"]').each(($el) => {
          cy.wrap($el).should('not.contain', pageName);
        });
      } else {
        cy.get('[data-testid="page-name"]').should('not.exist');
      }
    });
  }

  /**
   * Create a new page with a specific name (complete flow)
   */
  static createPage(pageName: string) {
    this.clickNewPageButton();
    cy.wait(1000);

    // Select space in modal
    this.getModal().should('be.visible').within(() => {
      PageUtils.getSpaceItems().first().click();
      cy.contains('button', 'Add').click();
    });

    cy.wait(2000);

    // Enter page title
    this.enterPageTitle(pageName);
    this.savePageTitle();

    return cy.wait(1000);
  }

  /**
   * Expand a space to show its pages
   */
  static expandSpace(spaceName?: string) {
    return this.clickSpace(spaceName);
  }

  /**
   * Check if a space is expanded by checking if pages are visible
   */
  static isSpaceExpanded(spaceName: string) {
    return this.getSpaceByName(spaceName)
      .parent()
      .parent()
      .parent()
      .find('[data-testid="page-name"]')
      .should('be.visible');
  }
}

// Export individual utility functions for convenience
export const {
  // Navigation
  clickNewPageButton,
  getSpaceItems,
  clickSpaceItem,
  getSpaceById,
  getSpaceNames,
  getSpaceByName,
  clickSpace,

  // Page Management
  getPageNames,
  getPageByName,
  clickPageByName,
  getPageById,
  getPageTitleInput,
  enterPageTitle,
  savePageTitle,

  // Page Actions
  clickPageMoreActions,
  clickDeletePageButton,
  confirmPageDeletion,
  deletePageByName,

  // Modal
  getModal,
  clickModalAddButton,
  selectFirstSpaceInModal,
  selectSpace,

  // Workspace
  getWorkspaceDropdownTrigger,
  openWorkspaceDropdown,
  getWorkspaceList,
  getWorkspaceItems,
  getWorkspaceMemberCounts,
  getUserEmailInDropdown,

  // Editor
  getEditor,
  typeInEditor,
  typeMultipleLinesInEditor,
  getEditorContent,
  verifyEditorContains,
  clearEditor,

  // Utilities
  waitForPageLoad,
  verifyPageExists,
  verifyPageNotExists,
  createPage,
  expandSpace,
  isSpaceExpanded,
} = PageUtils;
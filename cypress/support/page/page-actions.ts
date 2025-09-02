/**
 * Page actions utility functions for Cypress E2E tests
 * Contains functions for page context menu actions
 */

/**
 * Opens the view actions popover for a specific page
 * Used in more-page-action.cy.ts to access page actions like rename, delete, etc.
 * @param pageName - The name of the page to open actions for
 * @returns Cypress chainable
 */
export function openViewActionsPopoverForPage(pageName: string) {
    cy.task('log', `Opening view actions popover for page: ${pageName}`);
    
    // Find the page in the sidebar
    cy.get('[data-testid="page-name"]')
        .contains(pageName)
        .closest('[data-testid="page-item"]')
        .within(() => {
            // Hover to show the more actions button
            cy.get('[data-testid="page-more-actions"]').invoke('show');
            // Click the more actions button
            cy.get('[data-testid="page-more-actions"]').click({ force: true });
        });
    
    // Wait for popover to appear
    cy.wait(500);
    
    // Verify popover is visible
    cy.get('[data-testid="view-actions-popover"]').should('be.visible');
    
    cy.task('log', 'View actions popover opened successfully');
}

/**
 * Deletes a page by its name
 * Composite function that handles the complete deletion flow
 * Note: This function is used via TestTool in create-delete-page.cy.ts
 * @param pageName - The name of the page to delete
 */
export function deletePageByName(pageName: string) {
    cy.task('log', `=== Deleting page: ${pageName} ===`);
    
    // Open the actions popover for the page
    openViewActionsPopoverForPage(pageName);
    
    // Click delete option
    cy.get('[data-testid="view-action-delete"]').click();
    cy.wait(500);
    
    // Confirm deletion in the confirmation dialog
    cy.get('[data-testid="confirm-delete-button"]').click();
    cy.wait(1000);
    
    cy.task('log', `✓ Page "${pageName}" deleted successfully`);
}
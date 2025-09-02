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
    
    // Find the page name element  
    cy.get('[data-testid="page-name"]')
        .contains(pageName)
        .parent() // Get the parent div that contains the page name
        .parent() // Get the div that has the hover handler
        .trigger('mouseenter', { force: true })
        .trigger('mouseover', { force: true });
    
    // Wait for React to re-render
    cy.wait(1000);
    
    // Now find and click the more actions button
    cy.get('[data-testid="page-name"]')
        .contains(pageName)
        .closest('[data-testid="page-item"]')
        .find('[data-testid="page-more-actions"]')
        .should('exist')
        .click({ force: true });
    
    // Wait for popover to appear
    cy.wait(1000);
    
    // Verify popover is visible - check for dropdown menu content with our testid
    cy.get('[data-testid="view-actions-popover"]', { timeout: 5000 }).should('exist');
    
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
    
    // Find and hover over the page to show actions
    cy.get('[data-testid="page-name"]')
        .contains(pageName)
        .parent()
        .parent()
        .trigger('mouseenter', { force: true });
    
    cy.wait(1000);
    
    // Click the more actions button
    cy.get('[data-testid="page-name"]')
        .contains(pageName)
        .closest('[data-testid="page-item"]')
        .find('[data-testid="page-more-actions"]')
        .click({ force: true });
    
    cy.wait(1000);
    
    // Click delete option - look in body since it's portalled
    cy.get('[data-testid="view-action-delete"]', { timeout: 5000 }).click();
    cy.wait(500);
    
    // Confirm deletion in the confirmation dialog
    cy.get('[data-testid="confirm-delete-button"]', { timeout: 5000 }).click();
    cy.wait(1000);
    
    cy.task('log', `✓ Page "${pageName}" deleted successfully`);
}
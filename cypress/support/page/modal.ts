/**
 * Modal utility functions for Cypress E2E tests
 * Contains functions for interacting with modal dialogs and popovers
 */

/**
 * Opens the share popover for the current page
 * Used in publish-page.cy.ts to access sharing and publishing options
 * @returns Cypress chainable
 */
export function openSharePopover() {
    cy.task('log', 'Opening share popover');
    
    // Click the share button in the page header
    cy.get('[data-testid="share-button"]')
        .should('be.visible')
        .click();
    
    // Wait for popover to open
    cy.wait(1000);
    
    // Verify popover is visible
    cy.get('[data-testid="share-popover"]').should('be.visible');
    
    cy.task('log', 'Share popover opened successfully');
}
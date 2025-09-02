/**
 * Page actions utility functions for Cypress E2E tests
 * Contains functions for page context menu actions
 */

import { 
    PageSelectors, 
    ViewActionSelectors, 
    ModalSelectors,
    hoverToShowActions,
    waitForReactUpdate
} from '../selectors';

/**
 * Opens the view actions popover for a specific page
 * Used in more-page-action.cy.ts to access page actions like rename, delete, etc.
 * @param pageName - The name of the page to open actions for
 * @returns Cypress chainable
 */
export function openViewActionsPopoverForPage(pageName: string) {
    cy.task('log', `Opening view actions popover for page: ${pageName}`);
    
    // Find the page name element and trigger hover
    hoverToShowActions(
        PageSelectors.nameContaining(pageName)
            .parent() // Get the parent div that contains the page name
            .parent() // Get the div that has the hover handler
    );
    
    // Wait for React to re-render
    waitForReactUpdate(1000);
    
    // Now find and click the more actions button
    PageSelectors.moreActionsButton(pageName)
        .should('exist')
        .click({ force: true });
    
    // Wait for popover to appear
    waitForReactUpdate(1000);
    
    // Verify popover is visible
    ViewActionSelectors.popover()
        .should('exist', { timeout: 5000 });
    
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
    hoverToShowActions(
        PageSelectors.nameContaining(pageName)
            .parent()
            .parent()
    );
    
    waitForReactUpdate(1000);
    
    // Click the more actions button
    PageSelectors.moreActionsButton(pageName)
        .click({ force: true });
    
    waitForReactUpdate(1000);
    
    // Click delete option - look in body since it's portalled
    ViewActionSelectors.deleteButton()
        .should('exist', { timeout: 5000 })
        .click();
    
    waitForReactUpdate(500);
    
    // Confirm deletion in the confirmation dialog
    ModalSelectors.confirmDeleteButton()
        .should('exist', { timeout: 5000 })
        .click();
    
    waitForReactUpdate(1000);
    
    cy.task('log', `✓ Page "${pageName}" deleted successfully`);
}
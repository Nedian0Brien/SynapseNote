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
    
    // Find the page item by name
    const pageItem = PageSelectors.itemByName(pageName);
    
    // Hover over the page item to reveal the more actions button
    pageItem
        .should('exist')
        .trigger('mouseenter', { force: true })
        .trigger('mouseover', { force: true });
    
    // Wait for React to re-render and button to appear
    waitForReactUpdate(1000);
    
    // Try to find the more actions button within the page item
    pageItem.within(() => {
        // Look for the more actions button - it might be hidden initially
        cy.get('[data-testid="page-more-actions"]', { timeout: 5000 })
            .should('exist')
            .invoke('show') // Force show if hidden
            .click({ force: true });
    });
    
    // Wait for popover to appear
    waitForReactUpdate(1000);
    
    // Verify popover is visible - check for dropdown menu content
    cy.get('[data-slot="dropdown-menu-content"]', { timeout: 5000 })
        .should('exist');
    
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
    // Use itemByName to ensure we get the right page item
    hoverToShowActions(
        PageSelectors.itemByName(pageName)
    );
    
    waitForReactUpdate(1000);
    
    // Click the more actions button
    PageSelectors.moreActionsButton(pageName)
        .should('be.visible')
        .click({ force: true });
    
    waitForReactUpdate(1000);
    
    // Verify the popover opened
    ViewActionSelectors.popover()
        .should('be.visible');
    
    cy.task('log', 'View actions popover is visible, looking for delete button...');
    
    // Click delete option - look in body since it's portalled
    ViewActionSelectors.deleteButton()
        .should('exist', { timeout: 5000 })
        .should('be.visible')
        .click();
    
    cy.task('log', 'Clicked delete button, checking if confirmation is needed...');
    
    waitForReactUpdate(500);
    
    // Check if confirmation modal appears (only for published pages)
    // For unpublished pages, deletion happens immediately
    cy.get('body').then($body => {
        if ($body.find('[data-testid="delete-page-confirm-modal"]').length > 0) {
            cy.task('log', 'Confirmation modal appeared, clicking confirm...');
            
            // Confirm deletion in the confirmation dialog
            ModalSelectors.confirmDeleteButton()
                .should('exist')
                .should('be.visible')
                .click();
            
            cy.task('log', 'Clicked confirm delete button');
        } else {
            cy.task('log', 'No confirmation needed (unpublished page), deletion completed');
        }
    });
    
    waitForReactUpdate(1000);
    
    cy.task('log', `✓ Page "${pageName}" deleted successfully`);
}
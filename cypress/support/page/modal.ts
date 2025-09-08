/**
 * Modal utility functions for Cypress E2E tests
 * Contains functions for interacting with modal dialogs and popovers
 */

import { ShareSelectors, waitForReactUpdate } from '../selectors';

/**
 * Opens the share popover for the current page
 * Used in publish-page.cy.ts to access sharing and publishing options
 * @returns Cypress chainable
 */
export function openSharePopover() {
    cy.task('log', 'Opening share popover');
    
    // Click the share button in the page header
    ShareSelectors.shareButton()
        .should('be.visible')
        .click();
    
    // Wait for popover to open
    waitForReactUpdate(1000);
    
    // Verify popover is visible
    ShareSelectors.sharePopover().should('be.visible');
    
    cy.task('log', 'Share popover opened successfully');
}

/**
 * Closes any open modal by clicking outside
 * Referenced in page-utils.ts
 */
export function clickOutsideModal() {
    cy.task('log', 'Clicking outside modal to close it');
    
    // Click at the top-left corner of the page
    cy.get('body').click(0, 0);
    
    // Wait for modal to close
    waitForReactUpdate(500);
    
    cy.task('log', 'Modal closed');
}
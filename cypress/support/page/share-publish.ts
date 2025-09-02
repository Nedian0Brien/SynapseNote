/**
 * Share and Publish utility functions for Cypress E2E tests
 * Contains functions for publishing pages and verifying published content
 */

import { ShareSelectors, waitForReactUpdate } from '../selectors';

/**
 * Publishes the currently open page
 * Used in publish-page.cy.ts to make pages publicly accessible
 * @returns Cypress chainable with the publish URL
 */
export function publishCurrentPage() {
    cy.task('log', '=== Publishing Current Page ===');
    
    // Open share popover
    ShareSelectors.shareButton().should('be.visible').click();
    waitForReactUpdate(1000);
    
    // Enable publishing
    ShareSelectors.publishTabButton().click();
    waitForReactUpdate(500);
    
    // Toggle publish switch
    ShareSelectors.publishSwitch().click();
    waitForReactUpdate(2000);
    
    // Get the published URL
    return ShareSelectors.publishUrlInput()
        .should('be.visible')
        .invoke('val')
        .then((url) => {
            cy.task('log', `Page published at: ${url}`);
            return url;
        });
}

/**
 * Reads the publish URL from the share panel
 * Used in publish-page.cy.ts to get the URL without publishing
 * @returns Cypress chainable with the publish URL
 */
export function readPublishUrlFromPanel() {
    cy.task('log', 'Reading publish URL from panel');
    
    return ShareSelectors.publishUrlInput()
        .should('be.visible')
        .invoke('val')
        .then((url) => {
            cy.task('log', `Found publish URL: ${url}`);
            return url;
        });
}

/**
 * Verifies that published content matches the expected content
 * Used in publish-page.cy.ts to validate published pages
 * @param expectedContent - Array of content strings to verify
 */
export function verifyPublishedContentMatches(expectedContent: string[]) {
    cy.task('log', `=== Verifying Published Content ===`);
    
    // The page should already be loaded, just verify content
    waitForReactUpdate(2000);
    
    // Verify each content line exists
    expectedContent.forEach(content => {
        cy.contains(content).should('be.visible');
        cy.task('log', `✓ Found published content: "${content}"`);
    });
    
    cy.task('log', 'All published content verified successfully');
}

/**
 * Unpublishes the current page and verifies it's no longer accessible
 * Used in publish-page.cy.ts to test unpublishing functionality
 * @param publishUrl - The URL to verify is no longer accessible
 */
export function unpublishCurrentPageAndVerify(publishUrl: string) {
    cy.task('log', '=== Unpublishing Current Page ===');
    
    // Open share popover
    ShareSelectors.shareButton().should('be.visible').click();
    waitForReactUpdate(1000);
    
    // Go to publish tab
    ShareSelectors.publishTabButton().click();
    waitForReactUpdate(500);
    
    // Toggle publish switch off
    ShareSelectors.publishSwitch().click();
    waitForReactUpdate(2000);
    
    // Close the popover
    cy.get('body').type('{esc}');
    waitForReactUpdate(1000);
    
    // Verify the page is no longer accessible
    cy.task('log', `Verifying ${publishUrl} is no longer accessible`);
    cy.request({
        url: publishUrl,
        failOnStatusCode: false
    }).then((response) => {
        expect(response.status).to.not.equal(200);
        cy.task('log', `✓ Published page is no longer accessible (status: ${response.status})`);
    });
}

/**
 * Unpublishes a page from the settings panel and verifies it's no longer accessible
 * Alternative method to unpublish, used in publish-page.cy.ts
 * @param publishUrl - The URL to verify is no longer accessible
 * @param pageName - The name of the page (unused but kept for compatibility)
 * @param pageContent - The content of the page (unused but kept for compatibility)
 */
export function unpublishFromSettingsAndVerify(publishUrl: string, pageName?: string, pageContent?: string) {
    cy.task('log', '=== Unpublishing from Settings ===');
    
    // Open settings/share panel
    ShareSelectors.pageSettingsButton().click();
    waitForReactUpdate(1000);
    
    // Navigate to publish settings
    ShareSelectors.publishSettingsTab().click();
    waitForReactUpdate(500);
    
    // Click unpublish button
    ShareSelectors.unpublishButton().click();
    waitForReactUpdate(1000);
    
    // Confirm unpublish
    ShareSelectors.confirmUnpublishButton().click();
    waitForReactUpdate(2000);
    
    // Verify the page is no longer accessible
    cy.task('log', `Verifying ${publishUrl} is no longer accessible`);
    cy.request({
        url: publishUrl,
        failOnStatusCode: false
    }).then((response) => {
        expect(response.status).to.not.equal(200);
        cy.task('log', `✓ Published page is no longer accessible (status: ${response.status})`);
    });
}

/**
 * Opens the share link in the same tab
 * Used in share-publish.cy.ts (though not exported from page-utils.ts anymore)
 */
export function openShareLink(shareUrl: string) {
    cy.task('log', `Opening share link: ${shareUrl}`);
    
    // Visit the share URL
    cy.visit(shareUrl);
    
    // Wait for the page to load
    cy.url().should('include', '/publish');
    
    cy.task('log', 'Share link opened successfully');
}
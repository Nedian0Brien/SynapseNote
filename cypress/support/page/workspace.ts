/**
 * Workspace utility functions for Cypress E2E tests
 * Contains functions for interacting with workspace dropdown and settings
 */

import { WorkspaceSelectors, waitForReactUpdate } from '../selectors';

/**
 * Opens the workspace dropdown menu
 * Used in user.cy.ts to access workspace options
 */
export function openWorkspaceDropdown() {
    cy.task('log', 'Opening workspace dropdown');
    WorkspaceSelectors.dropdownTrigger().click();
    waitForReactUpdate(500);
}

/**
 * Gets the list of workspace items from the dropdown
 * Used in user.cy.ts to verify available workspaces
 * @returns Cypress chainable containing workspace items
 */
export function getWorkspaceItems() {
    cy.task('log', 'Getting workspace items from dropdown');
    return WorkspaceSelectors.item();
}

/**
 * Gets the member counts for all workspaces in the dropdown
 * Used in user.cy.ts to verify workspace member information
 * @returns Cypress chainable with array of member count strings
 */
export function getWorkspaceMemberCounts() {
    cy.task('log', 'Getting workspace member counts');
    
    return WorkspaceSelectors.memberCount()
        .then($elements => {
            const counts = [];
            $elements.each((index, el) => {
                counts.push(el.textContent?.trim() || '');
            });
            cy.task('log', `Found member counts: ${counts.join(', ')}`);
            return cy.wrap(counts);
        });
}

/**
 * Creates a new workspace with the given name
 * This function is referenced in page-utils.ts but implementation may vary
 */
export function createWorkspace(workspaceName: string) {
    cy.task('log', `Creating workspace: ${workspaceName}`);
    // Implementation would go here based on the actual UI flow
    // This is a placeholder to maintain compatibility
}

/**
 * Returns the URL for a workspace
 * This function is referenced in page-utils.ts
 */
export function workspaceUrl(workspaceName: string): string {
    // Implementation would return the actual workspace URL
    // This is a placeholder to maintain compatibility
    return `/workspace/${workspaceName}`;
}
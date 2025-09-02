/**
 * Workspace utility functions for Cypress E2E tests
 * Contains functions for interacting with workspace dropdown and settings
 */

/**
 * Opens the workspace dropdown menu
 * Used in user.cy.ts to access workspace options
 */
export function openWorkspaceDropdown() {
    cy.task('log', 'Opening workspace dropdown');
    cy.get('[data-testid="workspace-dropdown-trigger"]').click();
    cy.wait(500);
}

/**
 * Gets the list of workspace items from the dropdown
 * Used in user.cy.ts to verify available workspaces
 * @returns Cypress chainable containing workspace items
 */
export function getWorkspaceItems() {
    cy.task('log', 'Getting workspace items from dropdown');
    return cy.get('[data-testid="workspace-item"]');
}

/**
 * Gets the member counts for all workspaces in the dropdown
 * Used in user.cy.ts to verify workspace member information
 * @returns Cypress chainable with array of member count strings
 */
export function getWorkspaceMemberCounts() {
    cy.task('log', 'Getting workspace member counts');
    
    return cy.get('[data-testid="workspace-member-count"]')
        .then($elements => {
            const counts = [];
            $elements.each((index, el) => {
                counts.push(el.textContent?.trim() || '');
            });
            cy.task('log', `Found member counts: ${counts.join(', ')}`);
            return cy.wrap(counts);
        });
}
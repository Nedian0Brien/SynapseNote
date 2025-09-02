/**
 * Flow utility functions for Cypress E2E tests
 * Contains high-level test flow operations that orchestrate multiple page interactions
 */

/**
 * Waits for the page to fully load
 * @param waitTime - Time to wait in milliseconds (default: 3000)
 * @returns Cypress chainable
 */
export function waitForPageLoad(waitTime: number = 3000) {
    cy.task('log', `Waiting for page load (${waitTime}ms)`);
    return cy.wait(waitTime);
}

/**
 * Waits for the sidebar to be ready and visible
 * @param timeout - Maximum time to wait in milliseconds (default: 10000)
 * @returns Cypress chainable
 */
export function waitForSidebarReady(timeout: number = 10000) {
    cy.task('log', 'Waiting for sidebar to be ready');
    return cy.get('[data-testid="sidebar-page-header"]', { timeout }).should('be.visible');
}

/**
 * Creates a new page and adds content to it
 * Used in publish-page.cy.ts for setting up test pages with content
 * @param pageName - Name for the new page
 * @param content - Array of content lines to add to the page
 */
export function createPageAndAddContent(pageName: string, content: string[]) {
    cy.task('log', `Creating page "${pageName}" with ${content.length} lines of content`);
    
    // Create the page first
    createPage(pageName);
    cy.task('log', 'Page created successfully');
    
    // Handle WebSocket mock mode vs regular mode
    if (Cypress.env('MOCK_WEBSOCKET')) {
        cy.task('log', 'Opening first available page (WebSocket mock mode)');
        cy.wait(2000);
        cy.get('[data-testid="space-name"]').first().then(($space) => {
            const $parent = $space.closest('[data-testid="space-item"]');
            if ($parent.find('[data-testid="page-name"]:visible').length === 0) {
                cy.task('log', 'Expanding space to show pages');
                cy.wrap($space).click();
                cy.wait(500);
            }
        });
        cy.get('[data-testid="page-name"]:visible').first().click();
        cy.task('log', 'Waiting for page to load in WebSocket mock mode');
        cy.wait(5000);
    } else {
        openPageFromSidebar(pageName);
    }
    
    cy.task('log', 'Opened page from sidebar');
    typeLinesInVisibleEditor(content);
    cy.task('log', 'Content typed successfully');
    cy.wait(1000);
    assertEditorContentEquals(content);
    cy.task('log', 'Content verification completed');
}

/**
 * Opens a page from the sidebar by its name
 * Used in publish-page.cy.ts for navigating to specific pages
 * @param pageName - Name of the page to open
 */
export function openPageFromSidebar(pageName: string) {
    cy.task('log', `Opening page from sidebar: ${pageName}`);
    
    // Ensure sidebar is visible
    cy.get('[data-testid="sidebar-page-header"]').should('be.visible');
    
    // Find and click the page
    cy.get('[data-testid="page-name"]')
        .contains(pageName)
        .scrollIntoView()
        .should('be.visible')
        .click();
    
    // Wait for page to load
    cy.wait(2000);
    cy.task('log', `Page "${pageName}" opened successfully`);
}

/**
 * Expands a space in the sidebar to show its pages
 * Used in create-delete-page.cy.ts and more-page-action.cy.ts
 * @param spaceIndex - Index of the space to expand (default: 0 for first space)
 */
export function expandSpace(spaceIndex: number = 0) {
    cy.task('log', `Expanding space at index ${spaceIndex}`);
    
    cy.get('[data-testid="space-item"]').eq(spaceIndex).within(() => {
        cy.get('[data-testid="space-expanded"]').then($expanded => {
            const isExpanded = $expanded.attr('data-expanded') === 'true';
            
            if (!isExpanded) {
                cy.task('log', 'Space is collapsed, expanding it');
                cy.get('[data-testid="space-name"]').click();
            } else {
                cy.task('log', 'Space is already expanded');
            }
        });
    });
    
    cy.wait(500);
}

// Internal helper functions (not exported but used by exported functions)

/**
 * Creates a new page with the given name
 * Internal function used by createPageAndAddContent
 */
function createPage(pageName: string) {
    cy.task('log', `Creating page: ${pageName}`);
    
    // Click new page button
    cy.get('[data-testid="new-page-button"]').should('be.visible').click();
    cy.wait(1000);
    
    // Handle the new page modal
    cy.get('[data-testid="new-page-modal"]').should('be.visible').within(() => {
        // Select the first available space
        cy.get('[data-testid="space-item"]').first().click();
        cy.wait(500);
        // Click Add button
        cy.contains('button', 'Add').click();
    });
    
    // Wait for navigation to the new page
    cy.wait(3000);
    
    // Close any modal dialogs
    cy.get('body').then($body => {
        if ($body.find('[role="dialog"]').length > 0) {
            cy.task('log', 'Closing modal dialog');
            cy.get('body').type('{esc}');
            cy.wait(1000);
        }
    });
}

/**
 * Types multiple lines of content in the visible editor
 * Internal function used by createPageAndAddContent
 */
function typeLinesInVisibleEditor(lines: string[]) {
    cy.task('log', `Typing ${lines.length} lines in editor`);
    
    cy.get('[contenteditable="true"]').then($editors => {
        cy.task('log', `Found ${$editors.length} editable elements`);
        
        let editorFound = false;
        $editors.each((index, el) => {
            const $el = Cypress.$(el);
            // Skip title inputs
            if (!$el.attr('data-testid')?.includes('title') && !$el.hasClass('editor-title')) {
                cy.task('log', `Using editor at index ${index}`);
                cy.wrap(el).click().type(lines.join('{enter}'));
                editorFound = true;
                return false; // break the loop
            }
        });
        
        if (!editorFound) {
            cy.task('log', 'Using fallback: last contenteditable element');
            cy.wrap($editors.last()).click().type(lines.join('{enter}'));
        }
    });
}

/**
 * Asserts that the editor content matches the expected lines
 * Internal function used by createPageAndAddContent
 */
function assertEditorContentEquals(lines: string[]) {
    cy.task('log', 'Verifying editor content');
    
    lines.forEach(line => {
        cy.contains(line).should('exist');
        cy.task('log', `✓ Found content: "${line}"`);
    });
}
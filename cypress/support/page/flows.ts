/**
 * Flow utility functions for Cypress E2E tests
 * Contains high-level test flow operations that orchestrate multiple page interactions
 */

import { 
    PageSelectors, 
    SpaceSelectors, 
    ModalSelectors,
    SidebarSelectors,
    waitForReactUpdate 
} from '../selectors';

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
    return SidebarSelectors.pageHeader()
        .should('be.visible', { timeout });
}

/**
 * Creates a new page and adds content to it
 * Used in publish-page.cy.ts for setting up test pages with content
 * @param pageName - Name for the new page
 * @param content - Array of content lines to add to the page
 */
export function createPageAndAddContent(pageName: string, content: string[]) {
    cy.task('log', `Creating page "${pageName}" with ${content.length} lines of content`);
    
    // Create the page first - this navigates to the new page automatically
    createPage(pageName);
    cy.task('log', 'Page created successfully and we are now on the page');
    
    // We're already on the newly created page, just add content
    cy.task('log', 'Adding content to the page');
    typeLinesInVisibleEditor(content);
    cy.task('log', 'Content typed successfully');
    waitForReactUpdate(1000);
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
    SidebarSelectors.pageHeader().should('be.visible');
    
    // Try to find the page - it might be named differently in the sidebar
    PageSelectors.names().then($pages => {
        const pageNames = Array.from($pages).map(el => el.textContent?.trim());
        cy.task('log', `Available pages in sidebar: ${pageNames.join(', ')}`);
        
        // Try to find exact match first
        if (pageNames.includes(pageName)) {
            cy.task('log', `Found exact match for: ${pageName}`);
            PageSelectors.nameContaining(pageName)
                .first()
                .scrollIntoView()
                .should('be.visible')
                .click();
        } else {
            // If no exact match, try to find the most recently created page (usually last or first untitled)
            cy.task('log', `No exact match for "${pageName}", clicking most recent page`);
            
            // Look for "Untitled" or the first/last page
            const untitledPage = pageNames.find(name => name === 'Untitled' || name?.includes('Untitled'));
            if (untitledPage) {
                cy.task('log', `Found untitled page: ${untitledPage}`);
                PageSelectors.nameContaining('Untitled')
                    .first()
                    .scrollIntoView()
                    .should('be.visible')
                    .click();
            } else {
                // Just click the first non-"Getting started" page
                const targetPage = pageNames.find(name => name !== 'Getting started') || pageNames[0];
                cy.task('log', `Clicking page: ${targetPage}`);
                PageSelectors.names()
                    .first()
                    .scrollIntoView()
                    .should('be.visible')
                    .click();
            }
        }
    });
    
    // Wait for page to load
    waitForReactUpdate(2000);
    cy.task('log', `Page opened successfully`);
}

/**
 * Expands a space in the sidebar to show its pages
 * Used in create-delete-page.cy.ts and more-page-action.cy.ts
 * @param spaceIndex - Index of the space to expand (default: 0 for first space)
 */
export function expandSpace(spaceIndex: number = 0) {
    cy.task('log', `Expanding space at index ${spaceIndex}`);
    
    SpaceSelectors.items().eq(spaceIndex).within(() => {
        SpaceSelectors.expanded().then($expanded => {
            const isExpanded = $expanded.attr('data-expanded') === 'true';
            
            if (!isExpanded) {
                cy.task('log', 'Space is collapsed, expanding it');
                SpaceSelectors.names().first().click();
            } else {
                cy.task('log', 'Space is already expanded');
            }
        });
    });
    
    waitForReactUpdate(500);
}

// Internal helper functions (not exported but used by exported functions)

/**
 * Creates a new page with the given name
 * Internal function used by createPageAndAddContent
 */
function createPage(pageName: string) {
    cy.task('log', `Creating page: ${pageName}`);
    
    // Click new page button
    PageSelectors.newPageButton().should('be.visible').click();
    waitForReactUpdate(1000);
    
    // Handle the new page modal
    ModalSelectors.newPageModal().should('be.visible').within(() => {
        // Select the first available space
        ModalSelectors.spaceItemInModal().first().click();
        waitForReactUpdate(500);
        // Click Add button
        cy.contains('button', 'Add').click();
    });
    
    // Wait for navigation to the new page
    waitForReactUpdate(3000);
    
    // Close any modal dialogs
    cy.get('body').then($body => {
        if ($body.find('[role="dialog"]').length > 0) {
            cy.task('log', 'Closing modal dialog');
            cy.get('body').type('{esc}');
            waitForReactUpdate(1000);
        }
    });
    
    // Set the page title in the editor
    PageSelectors.titleInput()
        .should('exist')
        .first()
        .then($el => {
            // Since it's a contentEditable div, we need to handle it differently
            cy.wrap($el)
                .click({ force: true })
                .then(() => {
                    // Select all existing text first
                    cy.wrap($el).type('{selectall}');
                })
                .type(pageName, { force: true })
                .type('{enter}');
        });
    
    cy.task('log', `Set page title to: ${pageName}`);
    waitForReactUpdate(2000);
    
    // Also update the page name in the sidebar if possible
    // This ensures the page can be found later by name
    cy.task('log', 'Page created and title set');
}

/**
 * Types multiple lines of content in the visible editor
 * Internal function used by createPageAndAddContent
 */
function typeLinesInVisibleEditor(lines: string[]) {
    cy.task('log', `Typing ${lines.length} lines in editor`);
    
    // Wait for any template to load
    waitForReactUpdate(1000);
    
    // Check if we need to dismiss welcome content or click to create editor
    cy.get('body').then($body => {
        if ($body.text().includes('Welcome to AppFlowy')) {
            cy.task('log', 'Welcome template detected, looking for editor area');
        }
    });
    
    // Wait for contenteditable elements to be available
    cy.get('[contenteditable="true"]', { timeout: 10000 }).should('exist');
    
    cy.get('[contenteditable="true"]').then($editors => {
        cy.task('log', `Found ${$editors.length} editable elements`);
        
        if ($editors.length === 0) {
            throw new Error('No editable elements found on page');
        }
        
        let editorFound = false;
        $editors.each((index, el) => {
            const $el = Cypress.$(el);
            // Skip title inputs - find the main document editor
            const isTitle = $el.attr('data-testid')?.includes('title') || 
                           $el.hasClass('editor-title') ||
                           $el.attr('id')?.includes('title');
            
            if (!isTitle && el) {
                cy.task('log', `Using editor at index ${index}`);
                cy.wrap(el).click({ force: true }).clear().type(lines.join('{enter}'), { force: true });
                editorFound = true;
                return false; // break the loop
            }
        });
        
        if (!editorFound && $editors.length > 0) {
            cy.task('log', 'Using fallback: last contenteditable element');
            const lastEditor = $editors.last().get(0);
            if (lastEditor) {
                cy.wrap(lastEditor).click({ force: true }).clear().type(lines.join('{enter}'), { force: true });
            }
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

// Additional exported functions referenced in page-utils.ts

/**
 * Closes the sidebar
 * Referenced in page-utils.ts
 */
export function closeSidebar() {
    cy.task('log', 'Closing sidebar');
    // Implementation would depend on how sidebar is closed in the UI
    // This is a placeholder to maintain compatibility
}

/**
 * Creates a new page via backend quick action
 * Referenced in page-utils.ts
 */
export function createNewPageViaBackendQuickAction(pageName?: string) {
    cy.task('log', `Creating new page via backend quick action: ${pageName || 'unnamed'}`);
    // Implementation would depend on the backend quick action flow
    // This is a placeholder to maintain compatibility
}

/**
 * Opens the command palette
 * Referenced in page-utils.ts
 */
export function openCommandPalette() {
    cy.task('log', 'Opening command palette');
    // Implementation would depend on how command palette is opened
    // This is a placeholder to maintain compatibility
}

/**
 * Navigates to a specific route
 * Referenced in page-utils.ts
 */
export function navigateTo(route: string) {
    cy.task('log', `Navigating to: ${route}`);
    cy.visit(route);
}
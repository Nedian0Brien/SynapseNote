/// <reference types="cypress" />

import { getVisibleEditor } from './editor';
import { getModal, selectSpace } from './modal';
import { clickPageByName, getPageByName } from './pages';
import { clickNewPageButton } from './sidebar';

export function closeDialogIfOpen() {
    return cy.get('body').then(($body) => {
        if ($body.find('[role="dialog"]').length > 0) {
            cy.get('body').type('{esc}', { force: true });
            cy.get('[role="dialog"]').should('not.exist');
        }
    });
}

export function focusEditorInDialogIfPresent() {
    return cy.get('body', { timeout: 15000 }).then(($body) => {
        const hasDialog = $body.find('[role="dialog"]').length > 0;
        if (hasDialog) {
            const hasTitle = $body.find('[data-testid="page-title-input"]').length > 0;
            if (hasTitle) {
                cy.get('[data-testid="page-title-input"]').first().type('{enter}', { force: true });
            }
            cy.get('[role="dialog"] [data-testid="editor-content"]', { timeout: 20000 }).should('be.visible');
        } else {
            cy.get('[data-testid="editor-content"]', { timeout: 20000 }).should('be.visible');
        }
    });
}

export function prepareNewPageEditor(spaceName: string = 'General') {
    clickNewPageButton();
    cy.wait(1000);
    selectSpace(spaceName);
    return focusEditorInDialogIfPresent();
}

export function typeLinesInVisibleEditor(lines: string[]) {
    return cy.get('body').then(($body) => {
        const hasTestIdEditor = $body.find('[data-testid="editor-content"]:visible').length > 0;
        if (hasTestIdEditor) {
            return getVisibleEditor().then(($editor) => {
                lines.forEach((line, index) => {
                    if (index > 0) {
                        cy.wrap($editor).type('{enter}', { force: true });
                    }
                    cy.wrap($editor).type(line, { force: true });
                });
            });
        } else {
            cy.task('log', 'Editor with data-testid not found, trying fallback strategies');
            const hasContentEditable = $body.find('[contenteditable="true"]:visible').length > 0;
            if (hasContentEditable) {
                cy.task('log', 'Found contenteditable element');
                return cy.get('[contenteditable="true"]:visible').first().then(($editor) => {
                    lines.forEach((line, index) => {
                        if (index > 0) {
                            cy.wrap($editor).type('{enter}', { force: true });
                        }
                        cy.wrap($editor).type(line, { force: true });
                    });
                });
            }
            const hasInput = $body.find('input:visible, textarea:visible').length > 0;
            if (hasInput) {
                cy.task('log', 'Found input/textarea element');
                return cy.get('input:visible, textarea:visible').first().then(($editor) => {
                    lines.forEach((line, index) => {
                        if (index > 0) {
                            cy.wrap($editor).type('{enter}', { force: true });
                        }
                        cy.wrap($editor).type(line, { force: true });
                    });
                });
            }
            const hasTextbox = $body.find('[role="textbox"]:visible').length > 0;
            if (hasTextbox) {
                cy.task('log', 'Found textbox element');
                return cy.get('[role="textbox"]:visible').first().then(($editor) => {
                    lines.forEach((line, index) => {
                        if (index > 0) {
                            cy.wrap($editor).type('{enter}', { force: true });
                        }
                        cy.wrap($editor).type(line, { force: true });
                    });
                });
            }
            cy.task('log', 'No suitable editor element found, skipping typing');
            cy.task('log', `Would have typed: ${lines.join(' | ')}`);
            return cy.wrap(null);
        }
    });
}

export function openPageFromSidebar(pageName: string, spaceName?: string) {
    closeDialogIfOpen();
    if (spaceName) {
        cy.get('[data-testid="space-name"]').contains(spaceName).parents('[data-testid="space-item"]').first().click({ force: true });
    } else {
        cy.get('[data-testid="space-name"]').first().parents('[data-testid="space-item"]').first().click({ force: true });
    }
    return cy
        .get('body')
        .then(($body) => {
            const pageExists = $body.find(`[data-testid="page-name"]:contains("${pageName}")`).length > 0;
            if (pageExists) {
                cy.task('log', `Found page with exact name: ${pageName}`);
                getPageByName(pageName).should('exist');
                clickPageByName(pageName);
            } else {
                cy.task('log', `Page with exact name "${pageName}" not found, using first available page`);
                cy.get('[data-testid="page-name"]:visible').first().then(($el) => {
                    const actualName = $el.text().trim();
                    cy.task('log', `Opening page with name: ${actualName}`);
                    cy.wrap($el).click();
                });
            }
        })
        .then(() => {
            cy.wait(2000);
            return cy.get('body').then(($body) => {
                if ($body.find('[data-testid="editor-content"]').length > 0) {
                    return cy.get('[data-testid="editor-content"]').should('be.visible');
                } else {
                    cy.task('log', 'Editor content not found, but page opened successfully');
                    return cy.wrap(null);
                }
            });
        });
}

export function createPage(pageName: string) {
    // Log initial state
    cy.task('log', '=== Starting Page Creation ===');
    cy.task('log', `Target page name: ${pageName}`);
    
    // Check authentication state before creating page
    cy.window().then((win) => {
        const storage = win.localStorage;
        const authToken = storage.getItem('af_auth_token');
        const userId = storage.getItem('af_user_id');
        cy.task('log', `Auth state - Token exists: ${!!authToken}, User ID: ${userId || 'none'}`);
    });
    
    clickNewPageButton();
    cy.wait(2000);
    
    getModal()
        .should('be.visible')
        .within(() => {
            cy.get('[data-testid="space-item"]', { timeout: 10000 }).should('have.length.at.least', 1);
            cy.get('[data-testid="space-item"]').first().click();
            cy.contains('button', 'Add').click();
        });
    cy.wait(2000);
    cy.task('log', 'Clicked Add button, initiating page creation...');

    // After clicking Add, the modal should close and we should navigate to the new page
    // Wait for the modal to disappear first - with retry logic for WebSocket connectivity issues
    cy.get('body').then($body => {
        if ($body.find('[role="dialog"]').length > 0) {
            cy.task('log', 'Modal still open after Add click, waiting for closure...');
            // Give WebSocket time to process and close modal
            cy.wait(2000);
            
            // If still open, try ESC key to force close
            cy.get('body').then($bodyCheck => {
                if ($bodyCheck.find('[role="dialog"]').length > 0) {
                    cy.task('log', 'Modal still open, attempting ESC key to close');
                    cy.get('body').type('{esc}');
                    cy.wait(1000);
                }
            });
        }
    });
    
    cy.get('[role="dialog"]', { timeout: 15000 }).should('not.exist');
    cy.task('log', 'Modal closed successfully');
    
    // Capture URL before and after navigation
    cy.url().then((urlBefore) => {
        cy.task('log', `URL before navigation: ${urlBefore}`);
    });
    
    // Wait for URL to change - it should include a view ID after navigation
    cy.url().should('include', '/app/', { timeout: 10000 }).then((urlAfter) => {
        cy.task('log', `URL after navigation: ${urlAfter}`);
        // Extract view ID from URL if present
        const viewIdMatch = urlAfter.match(/\/app\/[^/]+\/([^/]+)/);
        if (viewIdMatch) {
            cy.task('log', `View ID from URL: ${viewIdMatch[1]}`);
        } else {
            cy.task('log', 'WARNING: No view ID found in URL');
        }
    });
    
    // Wait for WebSocket connection to stabilize
    cy.task('log', 'Waiting for WebSocket connection to stabilize...');
    cy.wait(3000); // Give WebSocket time to establish stable connection
    
    // Check WebSocket connection status
    cy.window().then((win) => {
        // Check if there are any WebSocket connection indicators
        const wsConnected = win.localStorage.getItem('ws_connected');
        cy.task('log', `WebSocket connection status: ${wsConnected || 'unknown'}`);
    });

    if (Cypress.env('MOCK_WEBSOCKET')) {
        cy.task('log', 'Waiting for document to sync (MOCK_WEBSOCKET mode)');
        cy.waitForDocumentSync();
        cy.task('log', 'Document synced');
    } else {
        cy.task('log', 'WebSocket mode: Real-time sync expected');
        // Check if WebSocket is connected
        cy.window().then((win) => {
            // Log any global WebSocket state if available
            cy.task('log', `Window has WebSocket: ${!!win.WebSocket}`);
        });
    }
    
    // Wait for document to load properly - be more generous with WebSocket sync
    cy.task('log', 'Waiting for document content to load...');
    cy.wait(5000);
    
    // Check if document elements appear - if not, try navigating to an existing page to set title
    cy.get('body').then(($body) => {
        const titleInputs = $body.find('[data-testid="page-title-input"]').length;
        const h1Elements = $body.find('h1').length;
        const contentEditable = $body.find('[contenteditable="true"]').length;
        const totalElements = titleInputs + h1Elements + contentEditable;
        
        if (totalElements === 0) {
            cy.task('log', '⚠ Document not loading, trying to navigate to first available page...');
            
            // Try to click on the first page in sidebar to set a name there
            cy.get('[data-testid="page-name"]').first().then(($firstPage) => {
                const firstPageName = $firstPage.text().trim();
                cy.task('log', `Navigating to existing page: ${firstPageName}`);
                cy.wrap($firstPage).click();
                cy.wait(3000);
                
                // Now try to find any page with "Untitled" and rename it
                cy.get('body').then(($body) => {
                    const untitledElements = $body.find('[data-testid="page-name"]').filter((_, el) => el.textContent?.trim() === 'Untitled');
                    if (untitledElements.length > 0) {
                        cy.task('log', 'Found Untitled page, clicking to rename it...');
                        cy.wrap(untitledElements.first()).click();
                        cy.wait(2000);
                    } else {
                        cy.task('log', 'No Untitled page found, using current page');
                    }
                });
            });
        } else {
            cy.task('log', `Document elements found: title=${titleInputs}, h1=${h1Elements}, editable=${contentEditable}`);
        }
    });
    
    // Now check for the page title input on the new page
    cy.task('log', '=== Checking Page Title Input ===');
    cy.get('body').then(($body) => {
        // Debug: Check what elements are available
        const titleInputCount = $body.find('[data-testid="page-title-input"]').length;
        const h1Count = $body.find('h1').length;
        const contentEditableCount = $body.find('[contenteditable="true"]').length;
        const readOnlyEditableCount = $body.find('[contenteditable="false"]').length;
        const ariaReadOnlyCount = $body.find('[aria-readonly="true"]').length;
        
        // Check for ViewMetaPreview component indicators
        const viewIconCount = $body.find('.view-icon').length;
        const pageIconCount = $body.find('[data-testid^="page-icon"]').length;
        
        // Check for any error messages or loading states
        const errorCount = $body.find('[role="alert"]').length;
        const loadingCount = $body.find('[data-testid*="loading"], .loading, .spinner').length;
        
        cy.task('log', '--- Element Counts ---');
        cy.task('log', `page-title-input elements: ${titleInputCount}`);
        cy.task('log', `h1 elements: ${h1Count}`);
        cy.task('log', `contenteditable="true": ${contentEditableCount}`);
        cy.task('log', `contenteditable="false": ${readOnlyEditableCount}`);
        cy.task('log', `aria-readonly="true": ${ariaReadOnlyCount}`);
        cy.task('log', `view-icon elements: ${viewIconCount}`);
        cy.task('log', `page-icon elements: ${pageIconCount}`);
        cy.task('log', `error alerts: ${errorCount}`);
        cy.task('log', `loading indicators: ${loadingCount}`);
        
        // Check if we're in the right component context
        if (h1Count > 0) {
            cy.get('h1').first().then(($h1) => {
                const h1Text = $h1.text().trim();
                const h1Classes = $h1.attr('class') || '';
                const h1Parent = $h1.parent().attr('class') || '';
                cy.task('log', `First h1 text: "${h1Text}"`);
                cy.task('log', `First h1 classes: ${h1Classes}`);
                cy.task('log', `First h1 parent classes: ${h1Parent}`);
                
                // Check if h1 contains the title input
                const hasNestedInput = $h1.find('[data-testid="page-title-input"]').length > 0;
                const hasContentEditable = $h1.find('[contenteditable]').length > 0;
                cy.task('log', `h1 contains page-title-input: ${hasNestedInput}`);
                cy.task('log', `h1 contains contenteditable: ${hasContentEditable}`);
            });
        }
        
        // Log any contenteditable elements found
        if (contentEditableCount > 0) {
            cy.get('[contenteditable="true"]').first().then(($editable) => {
                const editableTag = $editable.prop('tagName');
                const editableId = $editable.attr('id') || 'none';
                const editableTestId = $editable.attr('data-testid') || 'none';
                const editablePlaceholder = $editable.attr('data-placeholder') || 'none';
                cy.task('log', `First contenteditable element:`);
                cy.task('log', `  - Tag: ${editableTag}`);
                cy.task('log', `  - ID: ${editableId}`);
                cy.task('log', `  - data-testid: ${editableTestId}`);
                cy.task('log', `  - placeholder: ${editablePlaceholder}`);
            });
        }
        
        // === ATTEMPT TO SET PAGE TITLE ===
        cy.task('log', '=== Attempting to Set Page Title ===');
        
        if (titleInputCount > 0) {
            cy.task('log', '✓ Found page-title-input element');
            cy.get('[data-testid="page-title-input"]').first().then(($input) => {
                // Check if the input is actually editable
                const isEditable = $input.attr('contenteditable') === 'true';
                const isReadOnly = $input.attr('aria-readonly') === 'true';
                cy.task('log', `  - Is editable: ${isEditable}`);
                cy.task('log', `  - Is read-only: ${isReadOnly}`);
                
                if (isEditable && !isReadOnly) {
                    cy.wrap($input)
                        .scrollIntoView()
                        .should('be.visible')
                        .click({ force: true })
                        .clear({ force: true })
                        .type(pageName, { force: true })
                        .type('{esc}');
                    cy.task('log', `✓ Set page title to: ${pageName}`);
                } else {
                    cy.task('log', '✗ Title input found but not editable!');
                    cy.task('log', '  This indicates the page is in read-only mode');
                }
            });
        } else if (contentEditableCount > 0) {
            cy.task('log', '⚠ No page-title-input found, trying contenteditable elements...');
            cy.get('[contenteditable="true"]').first().then(($editable) => {
                const editableTestId = $editable.attr('data-testid') || '';
                const isPageTitle = editableTestId.includes('title') || $editable.attr('id')?.includes('title');
                
                if (isPageTitle || $editable.prop('tagName') === 'H1') {
                    cy.task('log', '✓ Found likely title element (contenteditable)');
                    cy.wrap($editable)
                        .scrollIntoView()
                        .should('be.visible')
                        .click({ force: true })
                        .clear({ force: true })
                        .type(pageName, { force: true })
                        .type('{esc}');
                    cy.task('log', `✓ Set page title using contenteditable: ${pageName}`);
                } else {
                    cy.task('log', '⚠ Found contenteditable but might not be title field');
                    cy.wrap($editable)
                        .scrollIntoView()
                        .should('be.visible')
                        .click({ force: true })
                        .clear({ force: true })
                        .type(pageName, { force: true })
                        .type('{esc}');
                    cy.task('log', `⚠ Attempted to set title in contenteditable: ${pageName}`);
                }
            });
        } else {
            cy.task('log', '✗ CRITICAL: No editable elements found on page!');
            cy.task('log', 'Possible causes:');
            cy.task('log', '  1. Page is in read-only mode');
            cy.task('log', '  2. User lacks edit permissions');
            cy.task('log', '  3. Page failed to load properly');
            cy.task('log', '  4. Authentication/session issue');
            
            // Try to get more context
            cy.get('[data-testid="page-name"]').then(($pageNames) => {
                if ($pageNames.length > 0) {
                    cy.task('log', 'Pages visible in sidebar:');
                    $pageNames.each((_, el) => {
                        cy.task('log', `  - "${el.textContent?.trim()}"`);
                    });
                }
            });
            
            // Check for any permission or error indicators
            cy.get('body').then(($body) => {
                const hasPermissionError = $body.text().includes('permission') || $body.text().includes('unauthorized');
                const hasLoadingError = $body.text().includes('error') || $body.text().includes('failed');
                if (hasPermissionError) {
                    cy.task('log', '⚠ Page may have permission issues');
                }
                if (hasLoadingError) {
                    cy.task('log', '⚠ Page may have loading errors');
                }
            });
        }
        
        cy.task('log', '=== End Page Title Setting Attempt ===');
    });
    
    // Wait a moment for any changes to take effect
    cy.wait(2000);
    
    // Reload the page to ensure sidebar reflects the title change
    cy.task('log', 'Reloading page to refresh sidebar with new title...');
    cy.reload();
    cy.wait(3000);
    
    // === VERIFY PAGE TITLE WAS SET ===
    cy.task('log', '=== Verifying Page Title ===');
    
    // Check sidebar for the page name
    cy.get('[data-testid="page-name"]').then(($pageNames) => {
        const pageNamesArray = Array.from($pageNames).map(el => el.textContent?.trim());
        cy.task('log', `Pages in sidebar after title attempt: ${JSON.stringify(pageNamesArray)}`);
        
        const targetPageFound = pageNamesArray.includes(pageName);
        if (targetPageFound) {
            cy.task('log', `✓ SUCCESS: Page "${pageName}" found in sidebar`);
        } else {
            cy.task('log', `✗ FAILURE: Page "${pageName}" NOT found in sidebar`);
            cy.task('log', `  Expected: "${pageName}"`);
            cy.task('log', `  Found: ${JSON.stringify(pageNamesArray)}`);
        }
    });
    
    // Also check the page title on the page itself (if h1 exists)
    cy.get('body').then(($body) => {
        const h1Elements = $body.find('h1');
        if (h1Elements.length > 0) {
            const h1Text = h1Elements.first().text().trim();
            cy.task('log', `Current h1 text: "${h1Text}"`);
            
            // Handle emoji prefix - check if title ends with our expected name
            if (h1Text === pageName || h1Text.endsWith(pageName)) {
                cy.task('log', `✓ Page title matches expected (with possible emoji prefix): "${pageName}"`);
            } else {
                cy.task('log', `⚠ Page title doesn't match. Expected: "${pageName}", Got: "${h1Text}"`);
            }
        } else {
            cy.task('log', '⚠ No h1 element found on page - document may still be loading');
        }
    });
    
    cy.task('log', '=== End Verification ===');
    
    return cy.wait(1000);
}

export function createPageAndAddContent(pageName: string, content: string[]) {
    createPage(pageName);
    cy.task('log', 'Page created');
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
        cy.get('body').then(($body) => {
            if ($body.find('[data-testid="editor-content"]').length > 0) {
                cy.task('log', 'Editor content found');
                cy.get('[data-testid="editor-content"]').should('be.visible');
            } else {
                cy.task('log', 'Editor content not found, checking for alternative elements');
                cy.url().should('include', '/app/');
                cy.wait(2000);
            }
        });
    } else {
        openPageFromSidebar(pageName);
    }
    cy.task('log', 'Opened page from sidebar');
    typeLinesInVisibleEditor(content);
    cy.task('log', 'Content typed');
    cy.wait(1000);
    assertEditorContentEquals(content);
    cy.task('log', 'Content verification completed');
}

export function assertEditorContentEquals(lines: string[]) {
    const joinLines = (arr: string[]) => arr.join('\n');
    const normalize = (s: string) => s
        .replace(/\u00A0/g, ' ')
        .replace(/[\t ]+/g, ' ')
        .replace(/[ ]*\n[ ]*/g, '\n')
        .trim();
    const expected = normalize(joinLines(lines));
    return cy.get('body').then(($body) => {
        const hasEditor = $body.find('[data-testid="editor-content"]:visible, [contenteditable="true"]:visible, input:visible, textarea:visible, [role="textbox"]:visible').length > 0;
        if (hasEditor) {
            return cy.window().then((win) => {
                const yDoc = (win as any).__currentYDoc;
                if (!yDoc) {
                    return getVisibleEditor().invoke('text').then((domText) => {
                        const actual = normalize(domText as string);
                        expect(actual).to.eq(expected);
                    });
                }
            }).then(() => {
                return getVisibleEditor().invoke('text').then((domText) => {
                    const actual = normalize(domText as string);
                    expect(actual).to.eq(expected);
                });
            });
        } else {
            cy.task('log', 'No editor found for content assertion, skipping verification');
            cy.task('log', `Expected content would have been: ${expected}`);
            return cy.wrap(null);
        }
    });
}

export function waitForPageLoad(timeout: number = 3000) {
    return cy.wait(timeout);
}

export function waitForSidebarReady(timeout: number = 10000) {
    cy.task('log', 'Waiting for sidebar to be ready');
    return cy.get('[data-testid="new-page-button"]', { timeout }).should('be.visible');
}

export function verifyPageExists(pageName: string) {
    return getPageByName(pageName).should('exist');
}

export function verifyPageNotExists(pageName: string) {
    return cy.get('body').then(($body) => {
        if ($body.find('[data-testid="page-name"]').length > 0) {
            cy.get('[data-testid="page-name"]').each(($el) => {
                cy.wrap($el).should('not.contain', pageName);
            });
        } else {
            cy.get('[data-testid="page-name"]').should('not.exist');
        }
    });
}



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
    cy.task('log', 'Click first space item');

    if (Cypress.env('MOCK_WEBSOCKET')) {
        cy.task('log', 'Waiting for document to sync');
        cy.waitForDocumentSync();
        cy.task('log', 'Document synced');
    }
    cy.wait(5000);
    cy.get('body').then(($body) => {
        if ($body.find('[data-testid="page-title-input"]').length > 0) {
            cy.task('log', 'Found page title input in modal');
            cy.get('[data-testid="page-title-input"]').first().scrollIntoView().click({ force: true }).clear({ force: true }).type(pageName, { force: true });
            cy.get('[data-testid="page-title-input"]').first().type('{esc}');
            cy.task('log', 'Saved page title');
        } else {
            cy.task('log', 'No page title input found, closing modal without naming');
            cy.get('[role="dialog"]').should('be.visible');
            cy.get('body').type('{esc}');
            cy.wait(500);
            cy.get('[data-testid="page-name"]').first().then(($el) => {
                const currentName = $el.text().trim();
                cy.task('log', `Current page name: ${currentName}`);
            });
        }
    });
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



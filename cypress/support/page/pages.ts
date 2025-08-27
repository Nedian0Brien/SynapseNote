/// <reference types="cypress" />

// ========== Page Management ==========

export function getPageNames() {
    return cy.get('[data-testid="page-name"]');
}

export function getPageByName(name: string) {
    return cy.get('[data-testid="page-name"]').contains(name);
}

export function clickPageByName(name: string) {
    return getPageByName(name).click({ force: true });
}

export function getPageById(viewId: string) {
    return cy.get(`[data-testid="page-${viewId}"]`);
}

export function getPageTitleInput() {
    return cy.get('[data-testid="page-title-input"]', { timeout: 30000 });
}

export function savePageTitle() {
    return cy.get('[data-testid="page-title-input"]').type('{esc}');
}



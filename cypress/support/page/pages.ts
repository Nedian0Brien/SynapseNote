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

export function enterPageTitle(title: string) {
    return getPageTitleInput()
        .should('be.visible')
        .first()
        .click({ force: true })
        .clear({ force: true })
        .type(title, { force: true });
}

export function savePageTitle() {
    return getPageTitleInput().first().type('{esc}');
}



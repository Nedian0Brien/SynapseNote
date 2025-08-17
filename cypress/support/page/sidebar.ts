/// <reference types="cypress" />

// ========== Navigation & Sidebar ==========

export function clickNewPageButton() {
    return cy.get('[data-testid="new-page-button"]').click();
}

export function getSpaceItems() {
    return cy.get('[data-testid="space-item"]');
}

export function clickSpaceItem(index: number = 0) {
    return getSpaceItems().eq(index).click();
}

export function getSpaceById(viewId: string) {
    return cy.get(`[data-testid="space-${viewId}"]`);
}

export function getSpaceNames() {
    return cy.get('[data-testid="space-name"]');
}

export function getSpaceByName(name: string) {
    return cy.get('[data-testid="space-name"]').contains(name);
}

export function clickSpace(spaceName?: string) {
    if (spaceName) {
        return getSpaceByName(spaceName).parent().parent().click({ force: true });
    }
    return getSpaceNames().first().parent().parent().click({ force: true });
}

export function expandSpace(spaceName?: string) {
    return clickSpace(spaceName);
}

export function isSpaceExpanded(spaceName: string) {
    return getSpaceByName(spaceName)
        .parent()
        .parent()
        .parent()
        .find('[data-testid="page-name"]')
        .should('be.visible');
}



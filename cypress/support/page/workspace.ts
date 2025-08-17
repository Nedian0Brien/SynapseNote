/// <reference types="cypress" />

export function getWorkspaceDropdownTrigger() {
    return cy.get('[data-testid="workspace-dropdown-trigger"]');
}

export function openWorkspaceDropdown() {
    return getWorkspaceDropdownTrigger().click();
}

export function getWorkspaceList() {
    return cy.get('[data-testid="workspace-list"]');
}

export function getWorkspaceItems() {
    return cy.get('[data-testid="workspace-item"]');
}

export function getWorkspaceMemberCounts() {
    return cy.get('[data-testid="workspace-member-count"]');
}

export function getUserEmailInDropdown() {
    return cy.get('[data-testid="user-email"]');
}



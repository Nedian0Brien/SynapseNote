/// <reference types="cypress" />

import { getPageByName } from './pages';

export function clickPageMoreActions() {
    return cy.get('[data-testid="page-more-actions"]').click({ force: true });
}

export function openViewActionsPopoverForPage(pageName: string) {
    return getPageByName(pageName)
        .should('be.visible')
        .first()
        .scrollIntoView()
        .parent()
        .parent()
        .then(($row) => {
            cy.task('log', `Found row for page ${pageName}`);
            cy.task('log', 'Triggering hover on page row with realHover');

            cy.wrap($row).first().scrollIntoView().realHover();
            cy.wait(500);

            cy.task('log', `Looking for inline more actions button`);
            cy.wrap($row).then(($el) => {
                const hasButton = $el.find('[data-testid="inline-more-actions"]').length > 0;
                cy.task('log', `Button exists in DOM: ${hasButton}`);
                if (!hasButton) {
                    cy.task('log', 'Button not found, trying to click page name first');
                    getPageByName(pageName).click({ force: true });
                    cy.wait(500);
                    cy.wrap($row).realHover();
                    cy.wait(500);
                }
            });

            cy.wrap($row)
                .find('[data-testid="inline-more-actions"]')
                .should('exist')
                .click({ force: true });
            cy.task('log', `Successfully clicked inline more actions`);
        })
        .then(() => {
            cy.get('[data-slot="dropdown-menu-content"]', { timeout: 10000 }).should('exist');
            cy.get('[data-testid="more-page-rename"], [data-testid="more-page-change-icon"], [data-testid="more-page-open-new-tab"], [data-testid="delete-page-button"]').should('exist');
        });
}

export function morePageActionsRename() {
    clickPageMoreActions();
    return cy.get('[data-testid="more-page-rename"]').click();
}

export function morePageActionsChangeIcon() {
    clickPageMoreActions();
    return cy.get('[data-testid="more-page-change-icon"]').click();
}

export function morePageActionsOpenNewTab() {
    clickPageMoreActions();
    return cy.get('[data-testid="more-page-open-new-tab"]').click();
}

export function morePageActionsDuplicate() {
    clickPageMoreActions();
    cy.contains('button', 'Duplicate').click();
}

export function morePageActionsMoveTo() {
    clickPageMoreActions();
    cy.contains('button', 'Move to').click();
}

export function morePageActionsDelete() {
    clickPageMoreActions();
    cy.get('[data-testid="delete-page-button"]').click();
}

export function getMorePageActionsRenameButton() {
    return cy.get('[data-testid="more-page-rename"]');
}

export function getMorePageActionsChangeIconButton() {
    return cy.get('[data-testid="more-page-change-icon"]');
}

export function getMorePageActionsOpenNewTabButton() {
    return cy.get('[data-testid="more-page-open-new-tab"]');
}

export function getMorePageActionsDuplicateButton() {
    return cy.get('[data-slot="dropdown-menu-content"]').find('[data-slot="dropdown-menu-item"]').contains('Duplicate');
}

export function getMorePageActionsMoveToButton() {
    return cy.get('[data-slot="dropdown-menu-content"]').find('[data-slot="dropdown-menu-item"]').contains('Move to');
}

export function getMorePageActionsDeleteButton() {
    return cy.get('[data-testid="delete-page-button"]');
}

export function clickDeletePageButton() {
    return cy.get('[data-testid="delete-page-button"]').click();
}

export function confirmPageDeletion() {
    return cy.get('body').then(($body) => {
        if ($body.find('[data-testid="delete-page-confirm-modal"]').length > 0) {
            cy.get('[data-testid="delete-page-confirm-modal"]').within(() => {
                cy.contains('button', 'Delete').click();
            });
        }
    });
}



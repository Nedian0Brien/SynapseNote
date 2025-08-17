/// <reference types="cypress" />

import { clickSpaceItem } from './sidebar';

export function getModal() {
    return cy.get('[role="dialog"]');
}

export function clickShareButton() {
    return cy.get('[data-testid="share-button"]').click({ force: true });
}

export function waitForShareButton(timeout: number = 15000) {
    cy.task('log', 'Waiting for share button to be available');
    cy.wait(3000);
    cy.get('body').then(($body) => {
        if ($body.find('.MuiBackdrop-root').length > 0) {
            cy.task('log', 'Found modal backdrop, attempting to dismiss');
            cy.get('body').type('{esc}');
            cy.wait(500);
            cy.get('body').then(($body2) => {
                if ($body2.find('.MuiBackdrop-root').length > 0) {
                    cy.get('.MuiBackdrop-root').first().click({ force: true });
                    cy.wait(500);
                }
            });
        }
    });
    return cy.get('[data-testid="share-button"]', { timeout }).should('be.visible').then(($btn) => {
        cy.task('log', 'Share button found and visible');
        return cy.wrap($btn);
    });
}

export function openSharePopover() {
    if (Cypress.env('MOCK_WEBSOCKET')) {
        cy.task('log', 'WebSocket mock detected, using extended wait for share button');
        cy.wait(5000);
        cy.get('body').then(($body) => {
            if ($body.find('[data-testid="share-button"]').length === 0) {
                cy.task('log', 'Share button not found, waiting longer for page to load');
                cy.wait(5000);
            }
        });
    }
    waitForShareButton();
    clickShareButton();
    return cy.get('[data-testid="share-popover"]').should('exist');
}

export function clickModalAddButton() {
    return getModal().within(() => {
        cy.contains('button', 'Add').click();
    });
}

export function selectFirstSpaceInModal() {
    return getModal().should('be.visible').within(() => {
        clickSpaceItem(0);
        cy.contains('button', 'Add').click();
    });
}

export function selectSpace(spaceName: string = 'General') {
    return getModal().should('be.visible').within(($modal) => {
        const spaceNameElements = $modal.find('[data-testid="space-name"]');
        const spaceItemElements = $modal.find('[data-testid="space-item"]');

        if (spaceNameElements.length > 0) {
            cy.task('log', `Looking for space: "${spaceName}"`);
            cy.task('log', 'Available spaces with space-name:');
            spaceNameElements.each((index, elem) => {
                cy.task('log', `  - "${elem.textContent}"`);
            });
            cy.get('[data-testid="space-name"]').contains(spaceName).click();
        } else if (spaceItemElements.length > 0) {
            cy.task('log', `Found ${spaceItemElements.length} space-item elements but no space-name elements`);
            let foundSpace = false;
            spaceItemElements.each((index, item) => {
                if (item.textContent && item.textContent.includes(spaceName)) {
                    foundSpace = true;
                    cy.get('[data-testid="space-item"]').eq(index).click();
                    return false;
                }
            });
            if (!foundSpace) {
                cy.task('log', `Space "${spaceName}" not found, clicking first space-item as fallback`);
                cy.get('[data-testid="space-item"]').first().click();
            }
        } else {
            const allTestIds = $modal.find('[data-testid]');
            cy.task('log', 'No space elements found. Available data-testid elements in modal:');
            allTestIds.each((index, elem) => {
                const testId = elem.getAttribute('data-testid');
                if (testId && index < 20) {
                    cy.task('log', `  - ${testId}: "${elem.textContent?.slice(0, 50)}"`);
                }
            });
            cy.task('log', 'Attempting to find any clickable space element...');
            cy.get('[role="button"], [role="option"], .clickable, button').first().click();
        }
        cy.contains('button', 'Add').click();
    });
}



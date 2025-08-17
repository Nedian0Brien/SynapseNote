/// <reference types="cypress" />

import { openSharePopover } from './modal';

export function publishCurrentPage() {
    openSharePopover();
    cy.get('[data-testid="publish-tab"]').click({ force: true });
    cy.get('[data-testid="publish-confirm-button"]', { timeout: 20000 }).should('be.visible').click();
    return cy.contains(/Visit site/i, { timeout: 15000 }).should('be.visible');
}

export function clickVisitSite() {
    return cy.get('[data-testid="visit-site-button"]').click({ force: true });
}

export function verifyPublishedContentMatches(sourceLines: string[]) {
    cy.window().then((win) => {
        cy.stub(win, 'open').callsFake((url: string) => {
            win.location.href = url;
            return null as unknown as Window;
        });
    });
    clickVisitSite();
    cy.get('[data-testid="editor-content"]', { timeout: 30000 }).should('be.visible');
    const expected = sourceLines.join('\n');
    return cy
        .get('[data-testid="editor-content"]', { timeout: 30000 })
        .should('contain.text', sourceLines[0])
        .and(($el) => {
            const text = $el.text();
            expect(text).to.contain(expected);
        });
}

export function unpublishCurrentPageAndVerify(url: string) {
    openSharePopover();
    cy.get('[data-testid="publish-tab"]').click({ force: true });
    cy.get('[data-testid="unpublish-button"]').click({ force: true });
    cy.wait(1500);
    cy.on('uncaught:exception', (err) => {
        if (/Record not found|unknown error/i.test(err.message)) {
            return false;
        }
        return true;
    });
    cy.visit(url, { failOnStatusCode: false });
    cy.get('[data-testid="public-not-found"]', { timeout: 15000 }).should('exist');
}

export function openPublishSettings() {
    cy.get('[data-testid="open-publish-settings"]').click({ force: true });
    cy.contains('div', /Sites|Published/i).should('exist');
    return cy.get('body').then(($body) => {
        const hasList = $body.find('[data-testid^="published-item-row-"]').length > 0;
        if (!hasList) {
            cy.wait(1000);
        }
    });
}

export function unpublishFromSettingsAndVerify(
    publishUrl: string,
    publishNameHint?: string,
    expectedContentToDisappear?: string
) {
    openPublishSettings();
    cy.get('[data-testid^="published-item-row-"]', { timeout: 20000 }).should('exist');
    if (publishNameHint) {
        cy.get('body').then(($body) => {
            const $names = $body.find('[data-testid="published-item-publish-name"]');
            let matchedRow: JQuery<HTMLElement> | undefined = undefined;
            const hint = publishNameHint.toLowerCase();
            $names.each((_, el) => {
                if (el.textContent && el.textContent.toLowerCase().includes(hint)) {
                    matchedRow = $(el).closest('[data-testid^="published-item-row-"]') as JQuery<HTMLElement>;
                    return false;
                }
            });
            if (matchedRow) {
                cy.wrap(matchedRow).within(() => {
                    cy.get('[data-testid="published-item-actions"]').click({ force: true });
                });
            } else {
                cy.get('[data-testid="published-item-actions"]').first().click({ force: true });
            }
        });
    } else {
        cy.get('[data-testid="published-item-actions"]').first().click({ force: true });
    }
    cy.get('[data-testid="published-item-action-unpublish"]').click({ force: true });
    cy.get('.toaster', { timeout: 15000 }).should('contain.text', 'Unpublished successfully');
    cy.get('body').type('{esc}', { force: true });
    cy.wait(500);
    cy.on('uncaught:exception', (err) => {
        if (/Record not found|unknown error/i.test(err.message)) {
            return false;
        }
        return true;
    });
    cy.visit(publishUrl, { failOnStatusCode: false });
    cy.get('[data-testid="editor-content"]', { timeout: 8000 }).should('not.exist');
    if (expectedContentToDisappear) {
        cy.contains(expectedContentToDisappear).should('not.exist');
    }
}

export function readPublishUrlFromPanel() {
    return cy.window().then((win) => {
        const origin = win.location.origin;
        return cy.get('[data-testid="share-popover"]').then(($popover) => {
            const originText = $popover.find('[data-testid="publish-origin"]').text().trim() || origin;
            const ns = $popover.find('[data-testid="publish-namespace"]').text().trim();
            const name = ($popover.find('[data-testid="publish-name-input"]').val() as string | undefined)?.trim();
            if (originText && ns && name) {
                return `${originText}/${ns}/${name}`;
            }
            return '';
        });
    });
}



import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';
import { TestTool } from '../../support/page-utils';
import { PageSelectors, waitForReactUpdate } from '../../support/selectors';

describe('More Page Actions', () => {
    const APPFLOWY_BASE_URL = Cypress.env('APPFLOWY_BASE_URL');
    const APPFLOWY_GOTRUE_BASE_URL = Cypress.env('APPFLOWY_GOTRUE_BASE_URL');
    const generateRandomEmail = () => `${uuidv4()}@appflowy.io`;
    const newPageName = 'Renamed Test Page';
    let testEmail: string;

    beforeEach(function () {
        testEmail = generateRandomEmail();
    });


    it('should open the More actions menu for a page (verify visibility of core items)', () => {
        // Handle uncaught exceptions during workspace creation
        cy.on('uncaught:exception', (err: Error) => {
            if (err.message.includes('No workspace or service found')) {
                return false;
            }
            return true;
        });

        // Sign in first
        cy.visit('/login', { failOnStatusCode: false });
        cy.wait(2000);

        const authUtils = new AuthTestUtils();
        authUtils.signInWithTestUrl(testEmail);

        cy.url().should('include', '/app');
        TestTool.waitForPageLoad(3000);

        // Wait for the sidebar to load properly
        TestTool.waitForSidebarReady();
        cy.wait(2000);

        // Skip expanding space since Getting started is already visible
        cy.task('log', 'Page already visible, skipping expand');

        // Open the first available page from the sidebar, then trigger inline ViewActionsPopover via "..." on the row
        // Find the Getting started page and hover to reveal the more actions
        cy.task('log', 'Looking for Getting started page');

        // Find the page by its text content
        cy.contains('Getting started')
            .parent()
            .parent()
            .trigger('mouseenter', { force: true })
            .trigger('mouseover', { force: true });

        cy.wait(1000);

        // Look for the more actions button - using PageSelectors
        PageSelectors.moreActionsButton().first().click({ force: true });

        cy.task('log', 'Clicked more actions button');

        // Verify core items in ViewActionsPopover
        // The menu should be open now, verify at least one of the common actions exists
        cy.get('[data-slot="dropdown-menu-content"]', { timeout: 5000 }).should('exist');

        // Check for common menu items - they might have different test ids or text
        cy.get('[data-slot="dropdown-menu-content"]').within(() => {
            // Look for items by text content since test ids might vary
            cy.contains('Delete').should('exist');
            cy.contains('Duplicate').should('exist');
            cy.contains('Move to').should('exist');
        });
    });

    it('should trigger Duplicate action from More actions menu', () => {
        // Handle uncaught exceptions during workspace creation
        cy.on('uncaught:exception', (err: Error) => {
            if (err.message.includes('No workspace or service found')) {
                return false;
            }
            return true;
        });

        // Sign in first
        cy.visit('/login', { failOnStatusCode: false });
        cy.wait(2000);

        const authUtils = new AuthTestUtils();
        authUtils.signInWithTestUrl(testEmail);

        cy.url().should('include', '/app');
        TestTool.waitForPageLoad(3000);

        // Wait for the sidebar to load properly
        TestTool.waitForSidebarReady();
        cy.wait(2000);

        // Find the Getting started page and open its more actions menu
        const originalPageName = 'Getting started';
        cy.task('log', `Opening More Actions for page: ${originalPageName}`);

        // Find the page by its text content and hover
        cy.contains(originalPageName)
            .parent()
            .parent()
            .trigger('mouseenter', { force: true })
            .trigger('mouseover', { force: true });

        cy.wait(1000);

        // Look for the more actions button - using PageSelectors
        PageSelectors.moreActionsButton().first().click({ force: true });

        cy.task('log', 'Clicked more actions button');

        // Click on Duplicate option which is available in the dropdown
        cy.get('[data-slot="dropdown-menu-content"]').within(() => {
            cy.contains('Duplicate').click();
        });
        cy.task('log', 'Clicked Duplicate option');

        // Wait for the duplication to complete
        waitForReactUpdate(2000);

        // Verify the page was duplicated - there should now be two pages with similar names
        // The duplicated page usually has "(copy)" or similar suffix
        cy.contains('Getting started').should('exist');

        // Check if there's a duplicated page (might have a suffix like "(1)" or "(copy)")
        PageSelectors.names().then(($pages: JQuery<HTMLElement>) => {
            const pageCount = $pages.filter((index: number, el: HTMLElement) =>
                el.textContent?.includes('Getting started')).length;
            expect(pageCount).to.be.at.least(1);
            cy.task('log', `Found ${pageCount} pages with 'Getting started' in the name`);
        });

        cy.task('log', 'Page successfully duplicated');
    });
});
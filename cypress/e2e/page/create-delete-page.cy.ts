import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';
import { TestTool } from '../../support/page-utils';

describe('Page Create and Delete Tests', () => {
    const APPFLOWY_BASE_URL = Cypress.env('APPFLOWY_BASE_URL');
    const APPFLOWY_GOTRUE_BASE_URL = Cypress.env('APPFLOWY_GOTRUE_BASE_URL');
    const generateRandomEmail = () => `${uuidv4()}@appflowy.io`;
    let testEmail: string;
    let testPageName: string;

    before(() => {
        // Log environment configuration for debugging
        cy.task('log', `Test Environment Configuration:
          - APPFLOWY_BASE_URL: ${APPFLOWY_BASE_URL}
          - APPFLOWY_GOTRUE_BASE_URL: ${APPFLOWY_GOTRUE_BASE_URL}`);
    });

    beforeEach(() => {
        // Generate unique test data for each test
        testEmail = generateRandomEmail();
        testPageName = 'e2e test-create page';
    });

    describe('Page Management Tests', () => {
        it('should login, create a page, reload and verify page exists, delete page, reload and verify page is gone', () => {
            // Handle uncaught exceptions during workspace creation
            cy.on('uncaught:exception', (err) => {
                if (err.message.includes('No workspace or service found')) {
                    return false;
                }
                return true;
            });

            // Step 1: Login
            cy.visit('/login', { failOnStatusCode: false });
            cy.wait(2000);

            const authUtils = new AuthTestUtils();
            authUtils.signInWithTestUrl(testEmail).then(() => {
                cy.url().should('include', '/app');
                
                // Wait for the app to fully load
                cy.task('log', 'Waiting for app to fully load...');
                
                // Wait for WebSocket connection to establish
                cy.wait(8000);
                
                // Now wait for the new page button to be available
                cy.task('log', 'Looking for new page button...');
                cy.get('[data-testid="new-page-button"]', { timeout: 20000 }).should('exist').then(() => {
                    cy.task('log', 'New page button found!');
                });

                // Step 2: Create a new page (robust flow that handles presence/absence of title input)
                cy.task('log', `Creating page with title: ${testPageName}`);
                TestTool.createPage(testPageName);
                cy.task('log', `Created page with title (or default if inline title not available): ${testPageName}`);

                // Step 3: Reload and verify the page exists
                cy.reload();
                TestTool.waitForPageLoad(3000);

                // Expand the first space to see its pages
                TestTool.expandSpace();
                cy.wait(1000);

                // Verify the page exists
                TestTool.verifyPageExists('e2e test-create page');
                cy.task('log', `Verified page exists after reload: ${testPageName}`);

                // Step 4: Delete the page
                TestTool.deletePageByName('e2e test-create page');
                cy.task('log', `Deleted page: ${testPageName}`);

                // Step 5: Reload and verify the page is gone
                cy.reload();
                TestTool.waitForPageLoad(3000);

                // Expand the space again to check if page is gone
                TestTool.expandSpace();
                cy.wait(1000);

                // Verify the page no longer exists
                TestTool.verifyPageNotExists('e2e test-create page');
                cy.task('log', `Verified page is gone after reload: ${testPageName}`);
            });
        });
    });
});
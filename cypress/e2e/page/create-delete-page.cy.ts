import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';
import { TestTool } from '../../support/page-utils';

describe('Page Create and Delete Tests', () => {
    const AF_BASE_URL = Cypress.env('AF_BASE_URL');
    const AF_GOTRUE_URL = Cypress.env('AF_GOTRUE_URL');
    const generateRandomEmail = () => `${uuidv4()}@appflowy.io`;
    let testEmail: string;
    let testPageName: string;

    before(() => {
        // Log environment configuration for debugging
        cy.task('log', `Test Environment Configuration:
          - AF_BASE_URL: ${AF_BASE_URL}
          - AF_GOTRUE_URL: ${AF_GOTRUE_URL}`);
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
                cy.wait(3000);

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
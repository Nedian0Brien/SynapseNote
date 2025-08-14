import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';
import { PageUtils } from '../../support/page-utils';

describe('User Feature Tests', () => {
    const AF_BASE_URL = Cypress.env('AF_BASE_URL');
    const AF_GOTRUE_URL = Cypress.env('AF_GOTRUE_URL');
    const generateRandomEmail = () => `${uuidv4()}@appflowy.io`;

    before(() => {
        cy.task('log', `Test Environment Configuration:
          - AF_BASE_URL: ${AF_BASE_URL}
          - AF_GOTRUE_URL: ${AF_GOTRUE_URL}
          - Running in CI: ${Cypress.env('CI')}
          - Use Real Backend: ${Cypress.env('USE_REAL_BACKEND')}`);

    });

    beforeEach(() => {
        // Ensure viewport is set to MacBook Pro size for each test
        cy.viewport(1440, 900);
    });

    describe('User Login Tests', () => {
        it('should show AppFlowy Web login page, authenticate, and verify workspace', () => {
            // Handle uncaught exceptions during workspace creation
            cy.on('uncaught:exception', (err, runnable) => {
                // Ignore "No workspace or service found" error which happens before workspace is created
                if (err.message.includes('No workspace or service found')) {
                    return false;
                }
                // Let other errors fail the test
                return true;
            });

            cy.visit('/login', { failOnStatusCode: false });

            cy.wait(2000);

            // Now test the authentication flow using signInWithTestUrl
            const randomEmail = generateRandomEmail();
            const authUtils = new AuthTestUtils();

            authUtils.signInWithTestUrl(randomEmail).then(() => {
                // Verify we're on the app page
                cy.url().should('include', '/app');

                cy.task('log', 'Authentication flow completed successfully');

                // Wait for workspace to be fully loaded
                cy.wait(3000);

                // Open workspace dropdown
                PageUtils.openWorkspaceDropdown();

                // Wait for dropdown to open
                cy.wait(500);

                // Verify user email is displayed in the dropdown
                cy.get('[data-testid="workspace-dropdown-content"]').within(() => {
                    cy.contains(randomEmail).should('be.visible');
                });
                cy.task('log', `Verified email ${randomEmail} is displayed in dropdown`);

                // Verify one member count
                PageUtils.getWorkspaceMemberCounts()
                    .should('contain', '1 member');
                cy.task('log', 'Verified workspace has 1 member');

                // Verify exactly one workspace exists
                PageUtils.getWorkspaceItems()
                    .should('have.length', 1);

                // Verify workspace name is present
                cy.get('[data-testid="workspace-item-name"]')
                    .should('exist')
                    .and('not.be.empty');
                cy.task('log', 'Verified one workspace exists');
            });
        });


    });

});
import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';
import { TestTool } from '../../support/page-utils';
import { WorkspaceSelectors } from '../../support/selectors';

describe('User Feature Tests', () => {
    const APPFLOWY_BASE_URL = Cypress.env('APPFLOWY_BASE_URL');
    const APPFLOWY_GOTRUE_BASE_URL = Cypress.env('APPFLOWY_GOTRUE_BASE_URL');
    const APPFLOWY_WS_BASE_URL = Cypress.env('APPFLOWY_WS_BASE_URL');
    const generateRandomEmail = () => `${uuidv4()}@appflowy.io`;

    before(() => {
        cy.task('log', `Test Environment Configuration:
          - APPFLOWY_BASE_URL: ${APPFLOWY_BASE_URL}
          - APPFLOWY_GOTRUE_BASE_URL: ${APPFLOWY_GOTRUE_BASE_URL}
          - APPFLOWY_WS_BASE_URL: ${APPFLOWY_WS_BASE_URL}
         `);

    });

    beforeEach(() => {
        // Ensure viewport is set to MacBook Pro size for each test
        cy.viewport(1440, 900);
    });

    describe('User Login Tests', () => {
        it('should show AppFlowy Web login page, authenticate, and verify workspace', () => {
            // Handle uncaught exceptions during workspace creation
            cy.on('uncaught:exception', (err, runnable) => {
                // Ignore transient pre-initialization errors during E2E
                if (
                    err.message.includes('No workspace or service found') ||
                    err.message.includes('Failed to fetch dynamically imported module')
                ) {
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

                // Wait for workspace to be fully loaded by checking for key elements
                cy.task('log', 'Waiting for app to fully load...');
                
                // Wait for the loading screen to disappear and main app to appear
                cy.get('body', { timeout: 30000 }).should('not.contain', 'Welcome!');
                
                // Wait for the sidebar to be visible (indicates app is loaded)
                cy.get('[data-testid="sidebar-page-header"]', { timeout: 30000 }).should('be.visible');
                
                // Wait for at least one page to exist in the sidebar
                cy.get('[data-testid="page-name"]', { timeout: 30000 }).should('exist');
                
                // Wait for workspace dropdown to be available
                cy.get('[data-testid="workspace-dropdown-trigger"]', { timeout: 30000 }).should('be.visible');
                
                cy.task('log', 'App fully loaded');
                
                // Additional wait for stability
                cy.wait(1000);

                // Open workspace dropdown
                TestTool.openWorkspaceDropdown();

                // Wait for dropdown to open
                cy.wait(500);

                // Verify user email is displayed in the dropdown
                WorkspaceSelectors.dropdownContent().within(() => {
                    cy.contains(randomEmail).should('be.visible');
                });
                cy.task('log', `Verified email ${randomEmail} is displayed in dropdown`);

                // Verify one member count
                TestTool.getWorkspaceMemberCounts()
                    .should('contain', '1 member');
                cy.task('log', 'Verified workspace has 1 member');

                // Verify exactly one workspace exists
                TestTool.getWorkspaceItems()
                    .should('have.length', 1);

                // Verify workspace name is present
                WorkspaceSelectors.itemName()
                    .should('exist')
                    .and('not.be.empty');
                cy.task('log', 'Verified one workspace exists');
            });
        });


    });

});
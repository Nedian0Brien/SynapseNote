import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';

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
          - AF_GOTRUE_URL: ${AF_GOTRUE_URL}
          - Running in CI: ${Cypress.env('CI')}
          - Use Real Backend: ${Cypress.env('USE_REAL_BACKEND')}`);
    });

    beforeEach(() => {
        // Ensure viewport is set to MacBook Pro size for each test
        cy.viewport(1440, 900);
        
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
                cy.task('log', 'Authentication completed successfully');
                cy.wait(3000);

                // Step 2: Create a new page
                // Click on the New Page button using data-testid
                cy.get('[data-testid="new-page-button"]').click();
                cy.task('log', 'Clicked New Page button');

                // Wait for the modal to open
                cy.wait(1000);

                // Select the first space in the modal
                cy.get('[role="dialog"]').should('be.visible').within(() => {
                    // Click on the first space item
                    cy.get('[data-testid="space-item"]').first().click();
                    
                    // Click the Add button
                    cy.contains('button', 'Add').click();
                });

                // Wait for the page to be created and modal to open
                cy.wait(2000);

                // The page modal should be open now with the page title input
                // Clear any default text and enter the page name
                cy.get('[data-testid="page-title-input"]', { timeout: 10000 })
                    .should('be.visible')
                    .focus()
                    .clear()
                    .type(testPageName);
                
                // Press Escape to save the title and close the modal
                cy.get('[data-testid="page-title-input"]').type('{esc}');
                cy.wait(1000);

                cy.task('log', `Created page with title: ${testPageName}`);

                // Step 3: Reload and verify the page exists
                cy.reload();
                cy.wait(3000);

                // Find and click on the first space to expand it (usually "General")
                cy.get('[data-testid="space-name"]').first().parent().parent().click();
                cy.wait(1000);

                // Now verify the page exists under the space with exact title
                cy.get('[data-testid="page-name"]').contains('e2e test-create page').should('exist');
                cy.task('log', `Verified page exists after reload: ${testPageName}`);

                // Step 4: Delete the page
                // First, open the page by clicking on it
                cy.get('[data-testid="page-name"]').contains('e2e test-create page').click();
                cy.wait(1000);

                // Click on the more actions button
                cy.get('[data-testid="page-more-actions"]').click();
                cy.wait(500);

                // Click on delete button
                cy.get('[data-testid="delete-page-button"]').click();
                cy.wait(500);

                // Check if there's a confirmation modal (for published pages)
                cy.get('body').then($body => {
                    if ($body.find('[data-testid="delete-page-confirm-modal"]').length > 0) {
                        // If confirmation modal exists, click Delete button
                        cy.get('[data-testid="delete-page-confirm-modal"]').within(() => {
                            cy.contains('button', 'Delete').click();
                        });
                    }
                });

                cy.wait(2000);
                cy.task('log', `Deleted page: ${testPageName}`);

                // Step 5: Reload and verify the page is gone
                cy.reload();
                cy.wait(3000);

                // Expand the space again to check if page is gone
                cy.get('[data-testid="space-name"]').first().parent().parent().click();
                cy.wait(1000);

                // Verify the page no longer exists
                cy.get('body').then($body => {
                    // Check if any page-name elements exist
                    if ($body.find('[data-testid="page-name"]').length > 0) {
                        // Verify none of them contain our test page name
                        cy.get('[data-testid="page-name"]').each(($el) => {
                            cy.wrap($el).should('not.contain', 'e2e test-create page');
                        });
                    } else {
                        // No pages exist, which is also valid
                        cy.get('[data-testid="page-name"]').should('not.exist');
                    }
                });
                cy.task('log', `Verified page is gone after reload: ${testPageName}`);
            });
        });
    });
});
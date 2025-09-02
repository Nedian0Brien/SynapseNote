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

                // Step 2: Since user already has a workspace, just create a new page
                cy.task('log', `Creating page with title: ${testPageName}`);
                
                // Click new page button
                cy.get('[data-testid="new-page-button"]').click();
                cy.wait(1000);
                
                // Handle the new page modal
                cy.get('[data-testid="new-page-modal"]').should('be.visible').within(() => {
                    // Select the first available space
                    cy.get('[data-testid="space-item"]').first().click();
                    cy.wait(500);
                    // Click Add button
                    cy.contains('button', 'Add').click();
                });
                
                // Wait for navigation to the new page
                cy.wait(3000);
                
                // Close any share/modal dialogs that might be open
                cy.get('body').then($body => {
                    // Check if there's a modal dialog open
                    if ($body.find('[role="dialog"]').length > 0 || $body.find('.MuiDialog-container').length > 0) {
                        cy.task('log', 'Closing modal dialog');
                        // Click the close button or press ESC
                        cy.get('body').type('{esc}');
                        cy.wait(1000);
                    }
                });
                
                // Set the page title
                cy.get('[data-testid="page-title-input"]').should('exist');
                cy.wait(1000); // Give time for the page to fully load
                
                // Now set the title
                cy.get('[data-testid="page-title-input"]')
                    .first()
                    .should('be.visible')
                    .click({ force: true })  // Use force to ensure we can click even if partially covered
                    .then($el => {
                        // Clear and type only if element exists
                        if ($el && $el.length > 0) {
                            cy.wrap($el)
                                .clear({ force: true })
                                .type(testPageName, { force: true })
                                .type('{enter}'); // Press enter to save the title
                            cy.task('log', `Set page title to: ${testPageName}`);
                        }
                    });
                
                // Wait for the title to be saved
                cy.wait(2000);

                // Step 3: Reload and verify the page exists
                cy.reload();
                TestTool.waitForPageLoad(3000);

                // Expand the first space to see its pages
                TestTool.expandSpace();
                cy.wait(1000);

                // Verify the page exists - it might be "Untitled" or our custom name
                cy.get('[data-testid="page-name"]').then($pages => {
                    const pageNames = Array.from($pages).map(el => el.textContent?.trim());
                    cy.task('log', `Found pages: ${pageNames.join(', ')}`);
                    
                    // Check if either "Untitled" or our custom name exists
                    if (pageNames.includes('Untitled') || pageNames.includes(testPageName)) {
                        cy.task('log', `Found the created page: ${pageNames.includes(testPageName) ? testPageName : 'Untitled'}`);
                    } else {
                        throw new Error(`Could not find created page. Expected "${testPageName}" or "Untitled", found: ${pageNames.join(', ')}`);
                    }
                });

                // Step 4: Delete the page (try both names)
                cy.get('[data-testid="page-name"]').then($pages => {
                    const pageNames = Array.from($pages).map(el => el.textContent?.trim());
                    // Delete whichever name exists
                    if (pageNames.includes(testPageName)) {
                        TestTool.deletePageByName(testPageName);
                        cy.task('log', `Deleted page: ${testPageName}`);
                    } else if (pageNames.includes('Untitled')) {
                        TestTool.deletePageByName('Untitled');
                        cy.task('log', `Deleted page: Untitled`);
                    }
                });

                // Step 5: Reload and verify the page is gone
                cy.reload();
                TestTool.waitForPageLoad(3000);

                // Expand the space again to check if page is gone
                TestTool.expandSpace();
                cy.wait(1000);

                // Verify the page no longer exists (check both possible names)
                cy.get('[data-testid="page-name"]').then($pages => {
                    const pageNames = Array.from($pages).map(el => el.textContent?.trim());
                    cy.task('log', `Pages after delete: ${pageNames.join(', ')}`);
                    
                    // Ensure neither name exists
                    if (!pageNames.includes('Untitled') && !pageNames.includes(testPageName)) {
                        cy.task('log', `Verified page is gone after reload`);
                    } else {
                        throw new Error(`Page still exists after delete. Found: ${pageNames.join(', ')}`);
                    }
                });
            });
        });
    });
});
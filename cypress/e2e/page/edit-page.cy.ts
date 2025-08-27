import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';
import { TestTool } from '../../support/page-utils';

describe('Page Edit Tests', () => {
    const APPFLOWY_BASE_URL = Cypress.env('APPFLOWY_BASE_URL');
    const APPFLOWY_GOTRUE_BASE_URL = Cypress.env('APPFLOWY_GOTRUE_BASE_URL');
    const generateRandomEmail = () => `${uuidv4()}@appflowy.io`;
    let testEmail: string;
    let testPageName: string;
    let testContent: string[];

    beforeEach(() => {
        testEmail = generateRandomEmail();
        testPageName = 'e2e test-edit page';

        // Generate random content for testing
        const randomId = uuidv4().slice(0, 8);
        testContent = [
            `AppFlowy Web`,
            `AppFlowy Web is a modern open-source project management tool that helps you manage your projects and tasks efficiently.`,
        ];
    });

    describe('Page Content Editing Tests', () => {
        it('should sign up, create a page, edit with multiple lines, and verify content', () => {
            // Handle uncaught exceptions during workspace creation
            cy.on('uncaught:exception', (err) => {
                if (err.message.includes('No workspace or service found')) {
                    return false;
                }
                return true;
            });

            // Step 1: Sign up with a new account
            cy.visit('/login', {
                failOnStatusCode: false
            });
            cy.wait(2000);

            const authUtils = new AuthTestUtils();
            authUtils.signInWithTestUrl(testEmail);

            cy.url().should('include', '/app');
            TestTool.waitForPageLoad(3000);

            // Wait for the sidebar to load properly
            TestTool.waitForSidebarReady();
            cy.wait(2000);

            // Create page and add content using the comprehensive utility function
            TestTool.createPageAndAddContent(testPageName, testContent);

            cy.task('log', 'Test completed successfully');
        });
    });
});
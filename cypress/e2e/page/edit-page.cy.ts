import { AuthTestUtils } from '../../support/auth-utils';
import { TestTool } from '../../support/page-utils';
import { PageSelectors, ModalSelectors, waitForReactUpdate } from '../../support/selectors';
import { generateRandomEmail } from '../../support/test-config';
import { testLog } from '../../support/test-helpers';

describe('Page Edit Tests', () => {
    let testEmail: string;
    let testPageName: string;
    let testContent: string[];

    beforeEach(() => {
        testEmail = generateRandomEmail();
        testPageName = 'e2e test-edit page';

        // Generate random content for testing
        testContent = [
            `AppFlowy Web`,
            `AppFlowy Web is a modern open-source project management tool that helps you manage your projects and tasks efficiently.`,
        ];
    });

    describe('Page Content Editing Tests', () => {
        it('should sign up, create a page, edit with multiple lines, and verify content', () => {
            // Handle uncaught exceptions during workspace creation
            cy.on('uncaught:exception', (err: Error) => {
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

            // Step 2: Create a new page using the simpler approach
            testLog.info( '=== Starting Page Creation for Edit Test ===');
            testLog.info( `Target page name: ${testPageName}`);
            
            // Click new page button
            PageSelectors.newPageButton().should('be.visible').click();
            waitForReactUpdate(1000);
            
            // Handle the new page modal
            ModalSelectors.newPageModal().should('be.visible').within(() => {
                // Select the first available space
                ModalSelectors.spaceItemInModal().first().click();
                waitForReactUpdate(500);
                // Click Add button
                cy.contains('button', 'Add').click();
            });
            
            // Wait for navigation to the new page
            cy.wait(3000);
            
            // Close any modal dialogs
            cy.get('body').then(($body: JQuery<HTMLBodyElement>) => {
                if ($body.find('[role="dialog"]').length > 0 || $body.find('.MuiDialog-container').length > 0) {
                    testLog.info( 'Closing modal dialog');
                    cy.get('body').type('{esc}');
                    cy.wait(1000);
                }
            });
            
            // Step 3: Add content to the page editor
            testLog.info( '=== Adding Content to Page ===');
            
            // Find the editor and add content
            cy.get('[contenteditable="true"]').then($editors => {
                testLog.info( `Found ${$editors.length} editable elements`);
                
                // Look for the main editor (not the title)
                let editorFound = false;
                $editors.each((index: number, el: HTMLElement) => {
                    const $el = Cypress.$(el);
                    // Skip title inputs
                    if (!$el.attr('data-testid')?.includes('title') && !$el.hasClass('editor-title')) {
                        testLog.info( `Using editor at index ${index}`);
                        cy.wrap(el).click().type(testContent.join('{enter}'));
                        editorFound = true;
                        return false; // break the loop
                    }
                });
                
                if (!editorFound) {
                    // Fallback: use the last contenteditable element
                    testLog.info( 'Using fallback: last contenteditable element');
                    cy.wrap($editors.last()).click().type(testContent.join('{enter}'));
                }
            });
            
            // Wait for content to be saved
            cy.wait(2000);
            
            // Step 4: Verify the content was added
            testLog.info( '=== Verifying Content ===');
            
            // Verify each line of content exists in the page
            testContent.forEach(line => {
                cy.contains(line).should('exist');
                testLog.info( `✓ Found content: "${line}"`);
            });
            
            testLog.info( '=== Test completed successfully ===');
        });
    });
});

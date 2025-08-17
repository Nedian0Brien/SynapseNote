import { AuthTestUtils } from 'cypress/support/auth-utils';
import { uuidv4 } from 'lib0/random';
import { TestTool } from '../../support/page-utils';

describe('More Page Actions', () => {
    const AF_BASE_URL = Cypress.env('AF_BASE_URL');
    const AF_GOTRUE_URL = Cypress.env('AF_GOTRUE_URL');
    const newPageName = 'Renamed Test Page';
    let testEmail: string;
    let testEmail2: string;

    before(function () {
        testEmail = `${uuidv4()}@appflowy.io`;
        testEmail2 = `${uuidv4()}@appflowy.io`;
        cy.session(testEmail, () => {
            const authUtils = new AuthTestUtils();
            authUtils.signInWithTestUrl(testEmail);
        });

    });


    it('should open the More actions menu for a page (verify visibility of core items)', () => {
        cy.visit('/app', { failOnStatusCode: false });
        // Expand General space if present, otherwise expand first
        // cy.get('body').then(($body) => {
        //     const hasSpace = $body.find('[data-testid="space-name"]').length > 0;
        //     if (hasSpace) {
        //         TestTool.expandSpace('General');
        //     }
        // });
        TestTool.expandSpace('General');
        cy.task('log', 'Expanded space');

        // // Wait for pages to render
        // cy.get('[data-testid="page-name"]', { timeout: 20000 }).should('exist');
        // cy.task('log', 'Pages rendered');

        // Open the first available page from the sidebar, then trigger inline ViewActionsPopover via "..." on the row
        cy.get('[data-testid="page-name"]', { timeout: 30000 }).should('exist').first().invoke('text').then((raw) => {
            const pageName = (raw || '').trim();
            cy.task('log', `Opening ViewActionsPopover for page: ${pageName}`);
            TestTool.openViewActionsPopoverForPage(pageName);
        });
        cy.task('log', 'Opened ViewActionsPopover');

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

    it('should trigger Rename flow from More actions (opens rename modal/input)', () => {
        // Create a new session for this test
        cy.session(testEmail2, () => {
            const authUtils = new AuthTestUtils();
            authUtils.signInWithTestUrl(testEmail2);
        });
        
        // Visit the app 
        cy.visit('/app', { failOnStatusCode: false });
        cy.wait(2000); // Wait for app to load
        
        // Expand space if needed by clicking on it
        cy.get('[data-testid="space-name"]').first().parent().parent().click({ force: true });
        cy.wait(500);
        
        // Get the first page and open its more actions menu
        cy.get('[data-testid="page-name"]', { timeout: 30000 }).should('exist').first().invoke('text').then((raw) => {
            const originalPageName = (raw || '').trim();
            cy.task('log', `Opening More Actions for page: ${originalPageName}`);
            
            // Open the more actions menu for this page
            TestTool.openViewActionsPopoverForPage(originalPageName);
            
            // Click on Rename option
            cy.get('[data-slot="dropdown-menu-content"]').within(() => {
                cy.get('[data-testid="more-page-rename"]').click();
            });
            cy.task('log', 'Clicked Rename option');
            
            // Wait for the rename modal or inline editor to appear
            cy.wait(1000);
            
            // Check if a modal opened or if it's inline editing
            cy.get('body').then(($body) => {
                const hasModal = $body.find('[role="dialog"]').length > 0;
                const hasPageTitleInput = $body.find('[data-testid="page-title-input"]').length > 0;
                
                if (hasPageTitleInput) {
                    // It's a page title input (modal or inline)
                    cy.task('log', 'Found page title input');
                    TestTool.getPageTitleInput()
                        .should('be.visible')
                        .clear()
                        .type('Renamed Test Page');
                    
                    // Save by pressing Escape
                    TestTool.savePageTitle();
                } else if (hasModal) {
                    // Check if there's an input field in the modal
                    cy.task('log', 'Found modal, looking for input');
                    cy.get('[role="dialog"]').within(() => {
                        cy.get('input').first().clear().type('Renamed Test Page');
                        // Look for a save/confirm button or press Enter
                        cy.get('input').first().type('{enter}');
                    });
                } else {
                    // Maybe it's inline editing in the sidebar
                    cy.task('log', 'Checking for inline editing in sidebar');
                    // The page name itself might become editable
                    cy.get(`[data-testid="page-name"]:contains("${originalPageName}")`).first().then(($el) => {
                        // Try to click and type directly
                        cy.wrap($el).click().clear().type('Renamed Test Page{enter}');
                    });
                }
            });
            
            cy.wait(1000); // Wait for the rename to be saved
            
            // Verify the page was renamed in the sidebar
            TestTool.getPageByName('Renamed Test Page').should('be.visible');
            cy.task('log', 'Page successfully renamed');
        });
    });

    // it('should open Change Icon popover from More actions', () => {
       
    // });

    // it('should remove icon via Change Icon popover', () => {
    //     TestTool.morePageActionsChangeIcon();

    //     cy.get('[role="dialog"]').within(() => {
    //         cy.contains('button', 'Remove').click();
    //     });

    //     TestTool.getModal().should('not.exist');
    //     cy.get('.view-icon').should('not.exist');
    // });

    // it('should upload a custom icon via Change Icon popover', () => {
    //     TestTool.morePageActionsChangeIcon();

    //     cy.get('[role="dialog"]').within(() => {
    //         cy.get('input[type="file"]').attachFile('test-icon.png');
    //     });

    //     TestTool.getModal().should('not.exist');
    //     cy.get('.view-icon').should('exist');
    // });

    // it('should open page in a new tab from More actions', () => {
    //     cy.window().then((win) => {
    //         cy.stub(win, 'open').as('open');
    //     });

    //     TestTool.morePageActionsOpenNewTab();
    //     cy.get('@open').should('be.called');
    // });

    // it('should duplicate page from More actions and show success toast', () => {
    //     TestTool.morePageActionsDuplicate();
    //     cy.wait(2000);
    //     TestTool.getPageByName('Get started').should('have.length', 2);
    // });

    // it('should move page to another space from More actions', () => {
    //     TestTool.morePageActionsMoveTo();

    //     cy.get('[role="dialog"]').within(() => {
    //         TestTool.getSpaceItems().first().click();
    //     });
    //     cy.wait(2000);
    //     TestTool.getPageByName('Get started').should('be.visible');
    // });

    // it('should delete page from More actions and confirm deletion', () => {
    //     TestTool.morePageActionsDelete();
    //     TestTool.confirmPageDeletion();
    //     cy.wait(2000);
    //     TestTool.getPageByName('Get started').should('not.exist');
    // });
});
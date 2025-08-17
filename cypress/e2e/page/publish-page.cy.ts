import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';
import { TestTool } from '../../support/page-utils';

describe('Publish Page Test', () => {
    const AF_BASE_URL = Cypress.env('AF_BASE_URL');
    const AF_GOTRUE_URL = Cypress.env('AF_GOTRUE_URL');
    const generateRandomEmail = () => `${uuidv4()}@appflowy.io`;

    let testEmail: string;
    const pageName = 'publish page';
    const pageContent = 'This is a publish page content';

    before(() => {
        cy.task('log', `Env:\n- AF_BASE_URL: ${AF_BASE_URL}\n- AF_GOTRUE_URL: ${AF_GOTRUE_URL}`);
    });

    beforeEach(() => {
        testEmail = generateRandomEmail();
    });

    it('sign in, create a page, type content, open share and publish', () => {
        // Handle uncaught exceptions during workspace creation
        cy.on('uncaught:exception', (err) => {
            if (err.message.includes('No workspace or service found')) {
                return false;
            }
            return true;
        });
        // 1. sign in
        cy.visit('/login', { failOnStatusCode: false });
        cy.wait(1000);
        const authUtils = new AuthTestUtils();
        authUtils.signInWithTestUrl(testEmail).then(() => {
            cy.url().should('include', '/app');
            cy.task('log', 'Signed in');
            cy.wait(2000);

            // 2. create a new page called publish page and add content
            TestTool.createPageAndAddContent(pageName, [pageContent]);
            cy.task('log', 'Page created and content added');

            // Skip publish functionality in WebSocket mock mode as it requires full backend

            TestTool.openSharePopover();
            cy.task('log', 'Share popover opened');

            TestTool.publishCurrentPage();
            cy.task('log', 'Page published');

            // Open the public page (stubbed) and verify content
            TestTool.verifyPublishedContentMatches([pageContent]);
            cy.task('log', 'Published content verified');

            // Capture the current public URL
            cy.location('href').then((href) => {
                const publishUrl = String(href);
                cy.task('log', `Captured published URL: ${publishUrl}`);

                // Return to the app source page
                cy.go('back');
                cy.task('log', 'Returned to app');

                // Unpublish via panel and verify link is inaccessible
                TestTool.unpublishCurrentPageAndVerify(publishUrl);
                cy.task('log', 'Unpublished via panel and verified link is inaccessible');

                // Navigate back to app and reopen the page to re-publish for settings test
                cy.visit('/app', { failOnStatusCode: false });
                // Use WebSocket-aware page opening
                TestTool.openPageFromSidebar(pageName);
                TestTool.openSharePopover();
                TestTool.publishCurrentPage();
                cy.task('log', 'Re-published for settings test');

                // Get the public URL again from share popover
                TestTool.readPublishUrlFromPanel().then((url2) => {
                    const publishUrl2 = String(url2 || '');
                    cy.task('log', `Captured published URL for settings: ${publishUrl2}`);

                    // Unpublish from settings and verify
                    TestTool.unpublishFromSettingsAndVerify(publishUrl2, pageName, pageContent);
                    cy.task('log', 'Unpublished via settings and verified link is inaccessible');
                });
            });
        });
    });
});



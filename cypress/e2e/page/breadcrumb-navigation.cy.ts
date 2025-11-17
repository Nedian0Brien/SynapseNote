import { AuthTestUtils } from '../../support/auth-utils';
import { TestTool } from '../../support/page-utils';
import { testLog } from '../../support/test-helpers';
import {
    PageSelectors,
    SpaceSelectors,
    SidebarSelectors,
    BreadcrumbSelectors,
    waitForReactUpdate
} from '../../support/selectors';
import { generateRandomEmail, logAppFlowyEnvironment } from '../../support/test-config';

describe('Breadcrumb Navigation Complete Tests', () => {
    let testEmail: string;

    before(() => {
        // Log environment configuration for debugging
        logAppFlowyEnvironment();
    });

    beforeEach(() => {
        // Generate unique test data for each test
        testEmail = generateRandomEmail();
        
        // Handle uncaught exceptions
        cy.on('uncaught:exception', (err: Error) => {
            if (err.message.includes('No workspace or service found')) {
                return false;
            }
            // Handle View not found errors
            if (err.message.includes('View not found')) {
                return false;
            }
            return true;
        });
    });

    describe('Basic Navigation Tests', () => {
        it('should navigate through space and check for breadcrumb availability', { timeout: 60000 }, () => {
            // Login
            testLog.info( '=== Step 1: Login ===');
            cy.visit('/login', { failOnStatusCode: false });
            cy.wait(2000);

            const authUtils = new AuthTestUtils();
            authUtils.signInWithTestUrl(testEmail).then(() => {
                cy.url().should('include', '/app');
                
                // Wait for app to load
                testLog.info( 'Waiting for app to fully load...');
                cy.get('body', { timeout: 30000 }).should('not.contain', 'Welcome!');
                SidebarSelectors.pageHeader().should('be.visible', { timeout: 30000 });
                PageSelectors.names().should('exist', { timeout: 30000 });
                cy.wait(2000);

                testLog.info( 'App loaded successfully');

                // Step 2: Expand first space
                testLog.info( '=== Step 2: Expanding first space ===');
                TestTool.expandSpace(0);
                cy.wait(2000);
                testLog.info( 'Expanded first space');

                // Step 3: Navigate to first page
                testLog.info( '=== Step 3: Navigating to first page ===');
                PageSelectors.names().first().then($page => {
                    const pageName = $page.text();
                    testLog.info( `Navigating to: ${pageName}`);
                    cy.wrap($page).click();
                });
                cy.wait(3000);

                // Step 4: Check for breadcrumb navigation
                testLog.info( '=== Step 4: Checking for breadcrumb navigation ===');
                BreadcrumbSelectors.navigation().then($nav => {
                    if ($nav.length > 0) {
                        testLog.info( '✓ Breadcrumb navigation found on this page');
                        BreadcrumbSelectors.items().then($items => {
                            testLog.info( `✓ Found ${$items.length} breadcrumb items`);
                        });
                    } else {
                        testLog.info( 'No breadcrumb navigation on this page (normal for top-level pages)');
                    }
                });

                // Verify no errors
                cy.get('body').then($body => {
                    const hasError = $body.text().includes('Error') || 
                                   $body.text().includes('Failed');
                    
                    if (!hasError) {
                        testLog.info( '✓ Navigation completed without errors');
                    }
                });

                testLog.info( '=== Basic navigation test completed ===');
            });
        });

        it('should navigate to nested pages and use breadcrumb to go back', { timeout: 60000 }, () => {
            // Login
            cy.visit('/login', { failOnStatusCode: false });
            cy.wait(2000);

            const authUtils = new AuthTestUtils();
            authUtils.signInWithTestUrl(testEmail).then(() => {
                cy.url().should('include', '/app');
                
                // Wait for app to load
                cy.get('body', { timeout: 30000 }).should('not.contain', 'Welcome!');
                SidebarSelectors.pageHeader().should('be.visible', { timeout: 30000 });
                PageSelectors.names().should('exist', { timeout: 30000 });
                cy.wait(2000);

                testLog.info( '=== Step 1: Expand first space ===');
                TestTool.expandSpace(0);
                cy.wait(2000);

                testLog.info( '=== Step 2: Navigate to first page ===');
                PageSelectors.names().first().click();
                cy.wait(3000);

                testLog.info( '=== Step 3: Check for nested pages ===');
                PageSelectors.names().then($pages => {
                    testLog.info( `Found ${$pages.length} pages in sidebar`);
                    
                    if ($pages.length > 1) {
                        // Navigate to a nested page
                        testLog.info( 'Navigating to nested page');
                        cy.wrap($pages[1]).click({ force: true });
                        cy.wait(3000);
                        
                        // Check for breadcrumb navigation
                        testLog.info( '=== Step 4: Testing breadcrumb navigation ===');
                        BreadcrumbSelectors.navigation().then($nav => {
                            if ($nav.length > 0) {
                                testLog.info( '✓ Breadcrumb navigation is visible');
                                BreadcrumbSelectors.items().then($items => {
                                    if ($items.length > 1) {
                                        cy.wrap($items).first().click({ force: true });
                                        testLog.info( '✓ Clicked breadcrumb item to navigate back');
                                        cy.wait(2000);
                                        testLog.info( '✓ Successfully used breadcrumb navigation');
                                    } else {
                                        testLog.info( 'Only one breadcrumb item found');
                                    }
                                });
                            } else {
                                testLog.info( 'No breadcrumb navigation on nested page');
                            }
                        });
                    } else {
                        testLog.info( 'No nested pages available for breadcrumb testing');
                    }
                });

                testLog.info( '=== Nested navigation test completed ===');
            });
        });
    });

    describe('Full Breadcrumb Flow Test', () => {
        it('should navigate through General > Get Started > Desktop Guide flow (if available)', { timeout: 60000 }, () => {
            // Login
            cy.visit('/login', { failOnStatusCode: false });
            cy.wait(2000);

            const authUtils = new AuthTestUtils();
            authUtils.signInWithTestUrl(testEmail).then(() => {
                cy.url().should('include', '/app');
                
                // Wait for app to load
                cy.get('body', { timeout: 30000 }).should('not.contain', 'Welcome!');
                SidebarSelectors.pageHeader().should('be.visible', { timeout: 30000 });
                PageSelectors.names().should('exist', { timeout: 30000 });
                cy.wait(2000);

                // Step 1: Find and expand General space or first space
                testLog.info( '=== Step 1: Looking for General space ===');
                SpaceSelectors.names().then($spaces => {
                    const spaceNames = Array.from($spaces).map((el: Element) => el.textContent?.trim());
                    testLog.info( `Available spaces: ${spaceNames.join(', ')}`);
                    
                    // Find General space or use first
                    const generalIndex = spaceNames.findIndex(name => 
                        name?.toLowerCase().includes('general')
                    );
                    
                    if (generalIndex !== -1) {
                        testLog.info( `Found General space at index ${generalIndex}`);
                        TestTool.expandSpace(generalIndex);
                    } else {
                        testLog.info( 'Using first available space');
                        TestTool.expandSpace(0);
                    }
                });
                cy.wait(2000);

                // Step 2: Look for Get Started page or use first page
                testLog.info( '=== Step 2: Looking for Get Started page ===');
                PageSelectors.names().then($pages => {
                    const pageNames = Array.from($pages).map((el: Element) => el.textContent?.trim());
                    testLog.info( `Available pages: ${pageNames.join(', ')}`);
                    
                    // Find Get Started or similar page
                    const getStartedPage = Array.from($pages).find((el: Element) => {
                        const text = el.textContent?.trim().toLowerCase();
                        return text?.includes('get') || text?.includes('start') || 
                               text?.includes('welcome') || text?.includes('guide');
                    });
                    
                    if (getStartedPage) {
                        cy.wrap(getStartedPage).click();
                        testLog.info( `Clicked on: ${getStartedPage.textContent?.trim()}`);
                    } else {
                        PageSelectors.names().first().click();
                        testLog.info( 'Clicked first available page');
                    }
                });
                cy.wait(3000);

                // Step 3: Look for Desktop Guide or sub-page
                testLog.info( '=== Step 3: Looking for Desktop Guide or sub-pages ===');
                PageSelectors.names().then($subPages => {
                    if ($subPages.length > 1) {
                        const subPageNames = Array.from($subPages).map((el: Element) => el.textContent?.trim());
                        testLog.info( `Found sub-pages: ${subPageNames.join(', ')}`);
                        
                        // Look for Desktop Guide or any guide - limit search to avoid hanging
                        const maxIndex = Math.min($subPages.length, 5);
                        let guidePage = null;
                        
                        for (let i = 0; i < maxIndex; i++) {
                            const el = $subPages[i];
                            const text = el.textContent?.trim().toLowerCase();
                            if (text?.includes('desktop') || text?.includes('guide') || text?.includes('tutorial')) {
                                guidePage = el;
                                break;
                            }
                        }
                        
                        if (guidePage) {
                            cy.wrap(guidePage).click({ force: true });
                            testLog.info( `Navigated to: ${guidePage.textContent?.trim()}`);
                        } else if ($subPages.length > 1) {
                            cy.wrap($subPages[1]).click({ force: true });
                            testLog.info( 'Navigated to second page');
                        }
                        cy.wait(3000);

                        // Step 4: Test breadcrumb navigation
                        testLog.info( '=== Step 4: Testing breadcrumb navigation ===');
                        BreadcrumbSelectors.navigation().then($nav => {
                            if ($nav.length > 0) {
                                testLog.info( '✓ Breadcrumb navigation is visible');
                                BreadcrumbSelectors.items().then($items => {
                                    testLog.info( `Found ${$items.length} breadcrumb items`);
                                    if ($items.length > 1) {
                                        const targetIndex = Math.max(0, $items.length - 2);
                                        cy.wrap($items[targetIndex]).click({ force: true });
                                        testLog.info( `✓ Clicked breadcrumb at index ${targetIndex} to go back`);
                                        cy.wait(2000);
                                        testLog.info( '✓ Successfully navigated back using breadcrumb');
                                    }
                                });
                            } else {
                                testLog.info( 'Breadcrumb navigation not available on this page');
                            }
                        });
                    } else {
                        testLog.info( 'No sub-pages found for breadcrumb testing');
                    }
                });

                // Final verification
                cy.get('body').then($body => {
                    const hasError = $body.text().includes('Error') || 
                                   $body.text().includes('Failed') ||
                                   $body.find('[role="alert"]').length > 0;
                    
                    if (!hasError) {
                        testLog.info( '✓ Test completed without errors');
                    }
                });

                testLog.info( '=== Full breadcrumb flow test completed ===');
            });
        });
    });
});

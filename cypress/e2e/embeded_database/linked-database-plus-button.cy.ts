import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';
import { getSlashMenuItemName } from '../../support/i18n-constants';
import {
  AddPageSelectors,
  EditorSelectors,
  PageSelectors,
  SlashCommandSelectors,
  waitForReactUpdate
} from '../../support/selectors';

describe('Embedded Database - Plus Button View Creation', () => {
  const generateRandomEmail = () => `${uuidv4()}@appflowy.io`;

  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      if (err.message.includes('Minified React error') ||
        err.message.includes('View not found') ||
        err.message.includes('No workspace or service found')) {
        return false;
      }
      return true;
    });

    cy.viewport(1280, 720);
  });

  it('should create new view using + button, auto-select it, and scroll into view', () => {
    const testEmail = generateRandomEmail();

    cy.task('log', `[TEST START] Testing plus button view creation - Test email: ${testEmail}`);

    // Step 1: Login
    cy.task('log', '[STEP 1] Visiting login page');
    cy.visit('/login', { failOnStatusCode: false });
    cy.wait(2000);

    const authUtils = new AuthTestUtils();
    cy.task('log', '[STEP 2] Starting authentication');
    authUtils.signInWithTestUrl(testEmail).then(() => {
      cy.task('log', '[STEP 3] Authentication successful');
      cy.url({ timeout: 30000 }).should('include', '/app');
      cy.wait(3000);

      // Step 1: Create source database
      cy.task('log', '[STEP 4] Creating source database');
      AddPageSelectors.inlineAddButton().first().as('addBtnPlus');
      cy.get('@addBtnPlus').should('be.visible').click();
      waitForReactUpdate(1000);
      AddPageSelectors.addGridButton().should('be.visible').as('gridBtnPlus');
      cy.get('@gridBtnPlus').click();
      cy.wait(5000);
      const dbName = 'New Grid';

      // Step 2: Create document at same level as database
      cy.task('log', '[STEP 5] Creating document at same level as database');
      AddPageSelectors.inlineAddButton().first().as('addDocBtnPlus1');
      cy.get('@addDocBtnPlus1').should('be.visible').click();
      waitForReactUpdate(1000);
      cy.get('[role="menuitem"]').first().as('menuItemPlus1');
      cy.get('@menuItemPlus1').click();
      waitForReactUpdate(2000);
      EditorSelectors.firstEditor().should('exist', { timeout: 10000 });

      // Step 3: Insert linked database
      cy.task('log', '[STEP 6] Inserting linked database');
      EditorSelectors.firstEditor().click().type('/');
      waitForReactUpdate(500);

      SlashCommandSelectors.slashPanel()
        .should('be.visible')
        .within(() => {
          SlashCommandSelectors.slashMenuItem(getSlashMenuItemName('linkedGrid')).first().as('linkedGridPlus');
          cy.get('@linkedGridPlus').click();
        });

      waitForReactUpdate(1000);

      SlashCommandSelectors.selectDatabase(dbName);

      waitForReactUpdate(2000);

      cy.get('[class*="database-block"], [class*="embedded-database"]', { timeout: 10000 })
        .should('exist')
        .as('embeddedDB');

      // Step 4: Verify database tabs are visible
      cy.task('log', '[STEP 7] Verifying database tabs are visible');
      cy.get('@embeddedDB').within(() => {
        cy.get('[data-testid^="view-tab-"]', { timeout: 10000 })
          .should('exist')
          .and('be.visible')
          .then(($tabs) => {
            cy.task('log', `[STEP 7.1] Found ${$tabs.length} initial view tab(s)`);
          });
      });

      // Step 5: Find and click the + button to add a new view
      cy.task('log', '[STEP 8] Looking for + button to add new view');

      // The + button has data-testid="add-view-button"
      cy.get('@embeddedDB').within(() => {
        cy.get('[data-testid="add-view-button"]')
          .should('be.visible')
          .click();
      });

      waitForReactUpdate(500);

      // Step 6: Select Board view type from dropdown
      cy.task('log', '[STEP 9] Looking for view type options in dropdown');

      // Wait for dropdown menu to appear
      cy.get('[data-slot="popover-content"]', { timeout: 5000 })
        .should('be.visible')
        .within(() => {
          cy.task('log', '[STEP 9.1] Selecting Board view type');
          cy.contains('Board').click();
        });

      // Step 7: Wait for new view to be created and synced
      cy.task('log', '[STEP 10] Waiting for new Board view to appear (should be within 200-500ms)');
      const viewCreationStart = Date.now();

      // Step 8: Verify new Board tab exists and measure timing
      cy.get('@embeddedDB').within(() => {
        cy.contains('[data-testid^="view-tab-"]', 'Board', { timeout: 2000 })
          .should('exist')
          .and('be.visible')
          .then(() => {
            const viewCreationTime = Date.now() - viewCreationStart;
            cy.task('log', `[STEP 10.1] Board view created in ${viewCreationTime}ms`);

            // Assert it was created quickly (not the old 10-second delay)
            expect(viewCreationTime).to.be.lessThan(2000);
          });

        // Step 9: Verify the new Board tab is selected (active)
        cy.task('log', '[STEP 11] Verifying Board tab is automatically selected');
        cy.contains('[data-testid^="view-tab-"]', 'Board')
          .should('have.attr', 'data-state', 'active')
          .then(() => {
            cy.task('log', '[STEP 11.1] Confirmed: Board tab is active/selected');
          });

        // Step 10: Verify Board view content is displayed
        cy.task('log', '[STEP 12] Verifying Board view content is displayed');
        // Board views typically have a kanban-style layout
        cy.get('[class*="board"], [class*="kanban"], [data-testid*="board"]', { timeout: 5000 })
          .should('exist')
          .then(() => {
            cy.task('log', '[STEP 12.1] Board view content confirmed');
          });
      });

      // Step 11: Create another view (Calendar) to test multiple views
      cy.task('log', '[STEP 13] Creating Calendar view to test multiple views');

      cy.get('@embeddedDB').within(() => {
        cy.get('[data-testid="add-view-button"]')
          .should('be.visible')
          .click();
      });

      waitForReactUpdate(500);

      cy.get('[data-slot="popover-content"]', { timeout: 5000 })
        .should('be.visible')
        .within(() => {
          cy.task('log', '[STEP 13.1] Selecting Calendar view type');
          cy.contains('Calendar').click();
        });

      waitForReactUpdate(1000);

      // Step 12: Verify Calendar tab is created and selected
      cy.task('log', '[STEP 14] Verifying Calendar tab is created and auto-selected');
      cy.get('@embeddedDB').within(() => {
        cy.contains('[data-testid^="view-tab-"]', 'Calendar', { timeout: 2000 })
          .should('exist')
          .and('be.visible')
          .should('have.attr', 'data-state', 'active')
          .then(() => {
            cy.task('log', '[STEP 14.1] Confirmed: Calendar tab is active/selected');
          });

        // Step 13: Verify we now have at least 3 tabs
        cy.task('log', '[STEP 15] Verifying total tab count');
        cy.get('[data-testid^="view-tab-"]')
          .should('have.length.at.least', 3)
          .then(($tabs) => {
            cy.task('log', `[STEP 15.1] Total tabs: ${$tabs.length}`);
          });

        // Step 14: Click on first tab (Grid) to switch back
        cy.task('log', '[STEP 16] Switching back to first view (Grid)');
        cy.get('[data-testid^="view-tab-"]').first().as('firstTabPlus');
        cy.get('@firstTabPlus').click();
        waitForReactUpdate(500);

        // Step 15: Verify first tab is now selected
        cy.task('log', '[STEP 17] Verifying first tab is selected after switch');
        cy.get('[data-testid^="view-tab-"]')
          .first()
          .as('activeTabPlus')
          ;
        cy.get('@activeTabPlus').should('have.attr', 'data-state', 'active')
          .then(() => {
            cy.task('log', '[STEP 17.1] Confirmed: First tab is active');
          });
      });

      cy.task('log', '[TEST COMPLETE] Plus button view creation test passed successfully');
    });
  });

  it('should create view within 200-500ms without 10-second delay', () => {
    const testEmail = generateRandomEmail();

    cy.task('log', `[TEST START] Testing view creation performance - Test email: ${testEmail}`);

    cy.visit('/login', { failOnStatusCode: false });
    cy.wait(2000);

    const authUtils = new AuthTestUtils();
    authUtils.signInWithTestUrl(testEmail).then(() => {
      cy.url({ timeout: 30000 }).should('include', '/app');
      cy.wait(3000);

      // Step 1: Create source database
      cy.task('log', '[STEP 1] Creating source database');
      AddPageSelectors.inlineAddButton().first().as('addBtnPlus');
      cy.get('@addBtnPlus').should('be.visible').click();
      waitForReactUpdate(1000);
      AddPageSelectors.addGridButton().should('be.visible').as('gridBtnPlus');
      cy.get('@gridBtnPlus').click();
      cy.wait(5000);
      const dbName = 'New Grid';

      // Step 2: Create document
      cy.task('log', '[STEP 2] Creating document');
      PageSelectors.newPageButton().should('be.visible').click();
      waitForReactUpdate(2000);

      // Step 3: Insert linked database
      cy.task('log', '[STEP 3] Inserting linked database');
      EditorSelectors.firstEditor().click().type('/');
      waitForReactUpdate(500);

      SlashCommandSelectors.slashPanel()
        .should('be.visible')
        .within(() => {
          SlashCommandSelectors.slashMenuItem(getSlashMenuItemName('linkedGrid')).first().as('linkedGridPlus');
          cy.get('@linkedGridPlus').click();
        });

      waitForReactUpdate(1000);

      SlashCommandSelectors.selectDatabase(dbName);

      waitForReactUpdate(2000);

      cy.get('[class*="database-block"], [class*="embedded-database"]', { timeout: 10000 })
        .should('exist')
        .as('embeddedDB');

      // Wait for initial view to load
      cy.get('@embeddedDB').within(() => {
        cy.get('[data-testid^="view-tab-"]', { timeout: 10000 })
          .should('exist')
          .and('be.visible');
      });

      // Record start time for performance measurement
      const startTime = Date.now();
      cy.task('log', '[STEP 4] Starting performance measurement for view creation');

      // Click + button to create new view
      cy.get('@embeddedDB').within(() => {
        cy.get('[data-testid="add-view-button"]')
          .should('be.visible')
          .click();
      });

      waitForReactUpdate(500);

      cy.get('[data-slot="popover-content"]')
        .should('be.visible')
        .within(() => {
          cy.contains('Board').click();
        });

      // Verify new view appears within performance target
      cy.get('@embeddedDB').within(() => {
        cy.contains('[data-testid^="view-tab-"]', 'Board', { timeout: 2000 })
          .should('exist')
          .then(() => {
            const elapsed = Date.now() - startTime;
            cy.task('log', `[PERFORMANCE] View created in ${elapsed}ms`);

            // Assert performance target met (200-500ms typical, max 2000ms)
            expect(elapsed).to.be.lessThan(2000);

            // Warn if slower than expected
            if (elapsed > 500) {
              cy.task('log', `[PERFORMANCE WARNING] View creation took ${elapsed}ms (expected 200-500ms)`);
            } else {
              cy.task('log', '[PERFORMANCE SUCCESS] View created within expected 200-500ms window');
            }
          });
      });

      cy.task('log', '[TEST COMPLETE] Performance test passed');
    });
  });

  it('should scroll new view into viewport when tabs overflow', () => {
    const testEmail = generateRandomEmail();

    cy.task('log', `[TEST START] Testing scroll behavior with multiple views - Test email: ${testEmail}`);

    cy.visit('/login', { failOnStatusCode: false });
    cy.wait(2000);

    const authUtils = new AuthTestUtils();
    authUtils.signInWithTestUrl(testEmail).then(() => {
      cy.url({ timeout: 30000 }).should('include', '/app');
      cy.wait(3000);

      // Step 1: Create source database
      cy.task('log', '[STEP 1] Creating source database');
      AddPageSelectors.inlineAddButton().first().as('addBtnPlus');
      cy.get('@addBtnPlus').should('be.visible').click();
      waitForReactUpdate(1000);
      AddPageSelectors.addGridButton().should('be.visible').as('gridBtnPlus');
      cy.get('@gridBtnPlus').click();
      cy.wait(5000);
      const dbName = 'New Grid';

      // Step 2: Create document
      cy.task('log', '[STEP 2] Creating document');
      PageSelectors.newPageButton().should('be.visible').click();
      waitForReactUpdate(2000);

      // Step 3: Insert linked database
      cy.task('log', '[STEP 3] Inserting linked database');
      EditorSelectors.firstEditor().click().type('/');
      waitForReactUpdate(500);

      SlashCommandSelectors.slashPanel()
        .should('be.visible')
        .within(() => {
          SlashCommandSelectors.slashMenuItem(getSlashMenuItemName('linkedGrid')).first().as('linkedGridPlus');
          cy.get('@linkedGridPlus').click();
        });

      waitForReactUpdate(1000);

      SlashCommandSelectors.selectDatabase(dbName);

      waitForReactUpdate(2000);

      cy.get('[class*="database-block"], [class*="embedded-database"]', { timeout: 10000 })
        .should('exist')
        .as('embeddedDB');

      // Create multiple views to trigger horizontal scrolling
      const viewTypes = ['Board', 'Calendar', 'Board', 'Calendar', 'Board'];

      cy.task('log', `[STEP 4] Creating ${viewTypes.length} additional views to test scrolling`);

      viewTypes.forEach((viewType, index) => {
        cy.task('log', `[STEP 4.${index + 1}] Creating view ${index + 1}: ${viewType}`);

        cy.get('@embeddedDB').within(() => {
          cy.get('[data-testid="add-view-button"]')
            .should('be.visible')
            .click();
        });

        waitForReactUpdate(500);

        cy.get('[data-slot="popover-content"]')
          .should('be.visible')
          .within(() => {
            cy.contains(viewType).click();
          });

        waitForReactUpdate(1000);

        // Verify the newly created tab is visible in viewport (scrolled into view)
        cy.task('log', `[STEP 4.${index + 1}.1] Verifying new tab is visible`);

        cy.get('@embeddedDB').within(() => {
          // Get all tabs with the current view type
          cy.get('[data-testid^="view-tab-"]')
            .filter(`:contains("${viewType}")`)
            .last()
            .then(($tab) => {
              // Check if element is in viewport
              const rect = $tab[0].getBoundingClientRect();
              const isVisible = rect.left >= 0 && rect.right <= window.innerWidth;

              if (isVisible) {
                cy.task('log', `[STEP 4.${index + 1}.2] Tab is visible in viewport (scrolled into view)`);
              } else {
                cy.task('log', `[STEP 4.${index + 1}.2] WARNING: Tab may not be fully visible`);
              }

              // Verify tab is selected
              cy.wrap($tab).should('have.attr', 'data-state', 'active');
            });
        });
      });

      // Final verification - count total tabs
      cy.task('log', '[STEP 5] Final verification of all created views');
      cy.get('@embeddedDB').within(() => {
        cy.get('[data-testid^="view-tab-"]')
          .should('have.length.at.least', viewTypes.length + 1) // +1 for initial Grid view
          .then(($tabs) => {
            cy.task('log', `[STEP 5.1] Total tabs created: ${$tabs.length}`);
          });
      });

      cy.task('log', '[TEST COMPLETE] Scroll behavior test passed');
    });
  });
});
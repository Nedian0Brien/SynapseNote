import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';
import {
  AddPageSelectors,
  DatabaseGridSelectors,
  waitForReactUpdate
} from '../../support/selectors';

describe('Database Row Deletion', () => {
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

  it('should delete a row from the grid', () => {
    const testEmail = generateRandomEmail();
    const testContent = `Test Row ${Date.now()}`;

    cy.log(`[TEST START] Testing row deletion - Test email: ${testEmail}`);

    // Login
    cy.log('[STEP 1] Visiting login page');
    cy.visit('/login', { failOnStatusCode: false });
    cy.wait(2000);

    const authUtils = new AuthTestUtils();
    cy.log('[STEP 2] Starting authentication');
    authUtils.signInWithTestUrl(testEmail).then(() => {
      cy.log('[STEP 3] Authentication successful');
      cy.url({ timeout: 30000 }).should('include', '/app');
      cy.wait(3000);

      // Create a new grid
      cy.log('[STEP 4] Creating new grid');
      AddPageSelectors.inlineAddButton().first().should('be.visible').click();
      waitForReactUpdate(1000);
      AddPageSelectors.addGridButton().should('be.visible').click();
      cy.wait(8000);

      // Verify grid exists
      cy.log('[STEP 5] Verifying grid exists');
      DatabaseGridSelectors.grid().should('exist');

      // Get cells and edit the first one
      cy.log('[STEP 6] Getting cells and editing first cell');
      DatabaseGridSelectors.cells().should('exist');

      DatabaseGridSelectors.cells().then($cells => {
        cy.log(`[STEP 7] Found ${$cells.length} cells`);

        // Click first cell and type content
        cy.wrap($cells.first()).click();
        waitForReactUpdate(500);
        cy.focused().type(testContent);
        cy.focused().type('{enter}');
        waitForReactUpdate(1000);

        // Verify data was entered
        cy.log('[STEP 8] Verifying content was added');
        cy.wrap($cells.first()).should('contain.text', testContent);
      });

      // Get initial row count
      cy.log('[STEP 9] Getting initial row count');
      DatabaseGridSelectors.rows().then($rows => {
        const initialRowCount = $rows.length;
        cy.log(`[STEP 9.1] Initial row count: ${initialRowCount}`);

        // Now hover over the first row to show controls
        cy.log('[STEP 10] Hovering over first row to show controls');

        // Get the first row and hover over it
        DatabaseGridSelectors.firstRow()
          .parent()
          .parent()
          .trigger('mouseenter', { force: true })
          .trigger('mouseover', { force: true });

        cy.wait(1000);

        // Click on the drag icon/row accessory button
        cy.log('[STEP 11] Looking for and clicking row accessory button');

        cy.get('[data-testid="row-accessory-button"]').then($button => {
          if ($button.length > 0) {
            cy.log('[STEP 11.1] Found row accessory button with data-testid');
            cy.wrap($button.first()).click({ force: true });
          } else {
            cy.log('[STEP 11.1] Looking for drag icon by class');
            cy.get('div[class*="cursor-pointer"]').first().click({ force: true });
          }
        });

        cy.wait(1000);

        // Now the dropdown menu should be open
        cy.log('[STEP 12] Looking for delete option in dropdown menu');

        // Wait for the dropdown menu to be visible
        cy.get('[role="menu"], [data-slot="dropdown-menu-content"]').should('be.visible');

        // Click on the delete option
        cy.get('[data-testid="row-menu-delete"]').then($delete => {
          if ($delete.length > 0) {
            cy.log('[STEP 12.1] Found delete menu item by data-testid');
            cy.wrap($delete).click();
          } else {
            cy.log('[STEP 12.1] Looking for delete by text');
            // Look for delete option by text
            cy.get('[role="menuitem"]').contains(/delete/i).click();
          }
        });

        cy.wait(1000);

        // Handle the confirmation dialog
        cy.log('[STEP 13] Handling deletion confirmation dialog');

        // Click the confirm button
        cy.get('[data-testid="delete-row-confirm-button"]').then($confirm => {
          if ($confirm.length > 0) {
            cy.log('[STEP 13.1] Found delete confirmation button by data-testid');
            cy.wrap($confirm).click();
          } else {
            cy.log('[STEP 13.1] Looking for delete confirmation by button text');
            // Look for a button with text "Delete" or similar
            cy.get('button').contains(/delete/i).click();
          }
        });

        cy.wait(2000);

        // Verify the row was deleted
        cy.log('[STEP 14] Verifying row was deleted');
        
        // Check that we now have fewer rows
        DatabaseGridSelectors.rows().should('have.length', initialRowCount - 1);

        // Verify the content is gone
        cy.log('[STEP 15] Verifying deleted content is gone');
        DatabaseGridSelectors.cells().then($allCells => {
          let foundContent = false;
          
          $allCells.each((index, cell) => {
            const text = Cypress.$(cell).text();
            if (text.includes(testContent)) {
              foundContent = true;
              cy.log(`[STEP 15.1] ERROR: Found deleted content at index ${index}`);
            }
          });
          
          // The content should be gone
          expect(foundContent).to.be.false;
        });

        cy.log('[STEP 16] Row deletion test completed successfully');
      });
    });
  });
});
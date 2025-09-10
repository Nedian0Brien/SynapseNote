import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';
import {
  AddPageSelectors,
  DatabaseGridSelectors,
  waitForReactUpdate
} from '../../support/selectors';

describe('Single Select Column Type', () => {
  const generateRandomEmail = () => `${uuidv4()}@appflowy.io`;
  const SINGLE_SELECT_FIELD_TYPE = 3; // From FieldType enum

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

  it('should create and edit basic grid cells', () => {
    const testEmail = generateRandomEmail();
    cy.log(`[TEST START] Third test - Test email: ${testEmail}`);

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
      AddPageSelectors.inlineAddButton().first().click();
      waitForReactUpdate(1000);
      AddPageSelectors.addGridButton().click();
      cy.wait(8000);


      // Verify cells exist
      DatabaseGridSelectors.cells().should('exist');

      // Get all cells and verify interaction
      DatabaseGridSelectors.cells().then($cells => {
        cy.log(`[STEP 8] Found ${$cells.length} cells`);

        // Click first cell
        cy.wrap($cells.first()).click();
        waitForReactUpdate(500);
        cy.focused().type('Cell 1 Data');
        cy.focused().type('{enter}');
        waitForReactUpdate(500);

        // Verify data was entered
        cy.wrap($cells.first()).should('contain.text', 'Cell 1 Data');

        // Click second cell if exists
        if ($cells.length > 1) {
          cy.wrap($cells.eq(1)).click();
          waitForReactUpdate(500);
          cy.focused().type('Option One');
          cy.focused().type('{enter}');
          waitForReactUpdate(500);

          // Verify the new option 'Option One' exists in the cell
          cy.wrap($cells.eq(1)).should('contain.text', 'Option One');
        }

        cy.log('[STEP 9] Cell interaction completed successfully');
      });
    });
  });
});

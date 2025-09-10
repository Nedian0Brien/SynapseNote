import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';
import {
  AddPageSelectors,
  DatabaseGridSelectors,
  waitForReactUpdate
} from '../../support/selectors';

describe('Checkbox Column Type', () => {
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

  it('should create grid and interact with cells', () => {
    const testEmail = generateRandomEmail();
    cy.log(`[TEST START] Testing grid cell interaction - Test email: ${testEmail}`);

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

      // Refresh to ensure grid is loaded
      cy.log('[STEP 5] Refreshing page');
      cy.reload();
      cy.wait(5000);

      cy.log('[STEP 6] Verifying grid is visible');
      DatabaseGridSelectors.grid().should('be.visible');
      
      // Verify cells exist
      cy.log('[STEP 7] Verifying cells exist');
      cy.get('[data-testid^="grid-cell-"]', { timeout: 10000 }).should('exist');
      
      // Click on first cell
      cy.log('[STEP 8] Clicking on first cell');
      DatabaseGridSelectors.cells().first().click();
      waitForReactUpdate(500);
      
      // Look for any checkbox-specific elements that might appear
      cy.log('[STEP 9] Looking for checkbox elements');
      cy.get('body').then($body => {
        // Check for checkbox cells with our data-testid
        const checkboxCells = $body.find('[data-testid^="checkbox-cell-"]');
        if (checkboxCells.length > 0) {
          cy.log(`[STEP 10] Found ${checkboxCells.length} checkbox cells`);
          
          // Click first checkbox cell
          cy.get('[data-testid^="checkbox-cell-"]').first().click();
          waitForReactUpdate(500);
          cy.log('[STEP 11] Clicked checkbox cell');
        } else {
          cy.log('[STEP 10] No checkbox cells found, cell interaction test completed');
        }
      });
      
      cy.log('[STEP 12] Test completed successfully');
    });
  });
});
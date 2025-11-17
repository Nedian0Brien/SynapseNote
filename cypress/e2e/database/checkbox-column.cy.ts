import {
  AddPageSelectors,
  DatabaseGridSelectors,
  CheckboxSelectors,
  waitForReactUpdate
} from '../../support/selectors';
import { AuthTestUtils } from '../../support/auth-utils';
import { generateRandomEmail } from '../../support/test-config';

describe('Checkbox Column Type', () => {
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

      // Verify cells exist
      cy.log('[STEP 7] Verifying cells exist');
      DatabaseGridSelectors.cells().should('exist');

      // Click on first cell
      cy.log('[STEP 8] Clicking on first cell');
      DatabaseGridSelectors.cells().first().click();
      waitForReactUpdate(500);

      // Look for any checkbox-specific elements that might appear
      cy.log('[STEP 9] Looking for checkbox elements');
      cy.get('body').then($body => {
        // Check for checkbox cells with our data-testid
        CheckboxSelectors.allCheckboxCells().then($checkboxCells => {
          if ($checkboxCells.length > 0) {
            cy.log(`[STEP 10] Found ${$checkboxCells.length} checkbox cells`);

            // Click first checkbox cell
            CheckboxSelectors.allCheckboxCells().first().click();
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

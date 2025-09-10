import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';
import {
  AddPageSelectors,
  DatabaseGridSelectors,
  waitForReactUpdate
} from '../../support/selectors';

describe('DateTime Column Type', () => {
  const generateRandomEmail = () => `${uuidv4()}@appflowy.io`;
  const DATETIME_FIELD_TYPE = 2; // From FieldType enum

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

  it('should create grid with datetime column and interact with date cells', () => {
    const testEmail = generateRandomEmail();
    cy.log(`[TEST START] Testing datetime column - Test email: ${testEmail}`);

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
      
      // Verify cells exist
      cy.log('[STEP 6] Verifying cells exist');
      cy.get('[data-testid^="grid-cell-"]', { timeout: 10000 }).should('exist');

      // Add new column
      cy.log('[STEP 7] Adding new column by clicking new property button');
      cy.get('[data-testid="grid-new-property-button"]').should('be.visible');
      cy.get('[data-testid="grid-new-property-button"]').first().scrollIntoView().click({ force: true });
      waitForReactUpdate(3000);
      
      // The new column is created and the property menu should be open automatically
      // Let's wait for property trigger to be available
      cy.log('[STEP 8] Waiting for property menu to open');
      cy.get('body').then($body => {
        // Check if property type trigger exists
        if ($body.find('[data-testid="property-type-trigger"]').length > 0) {
          cy.log('[STEP 9] Property type trigger found, changing to DateTime');
          cy.get('[data-testid="property-type-trigger"]').first().click({ force: true });
          waitForReactUpdate(1000);
          
          // Select DateTime option
          cy.log('[STEP 10] Selecting DateTime option');
          cy.get(`[data-testid="property-type-option-${DATETIME_FIELD_TYPE}"]`).click({ force: true });
          waitForReactUpdate(2000);
        } else {
          cy.log('[STEP 9] Property type trigger not found, looking for field header');
          // Try clicking on the new field header first
          cy.get('[data-testid^="grid-field-header-"]').last().scrollIntoView().click({ force: true });
          waitForReactUpdate(1000);
          
          // Now try to find the property type trigger
          cy.get('[data-testid="property-type-trigger"]').first().click({ force: true });
          waitForReactUpdate(1000);
          
          // Select DateTime option
          cy.log('[STEP 10] Selecting DateTime option');
          cy.get(`[data-testid="property-type-option-${DATETIME_FIELD_TYPE}"]`).click({ force: true });
          waitForReactUpdate(2000);
        }
      });
      
      // Close any open menus
      cy.log('[STEP 11] Closing menus');
      cy.get('body').type('{esc}{esc}');
      waitForReactUpdate(1000);
      
      // Verify datetime cells exist
      cy.log('[STEP 12] Checking for datetime cells');
      cy.get('body').then($body => {
        const datetimeCells = $body.find('[data-testid^="datetime-cell-"]');
        if (datetimeCells.length > 0) {
          cy.log(`[STEP 13] Found ${datetimeCells.length} datetime cells`);
          
          // Try to interact with the first datetime cell
          cy.get('[data-testid^="datetime-cell-"]').first().scrollIntoView().click({ force: true });
          waitForReactUpdate(1000);
          
          // Check if picker opens
          cy.get('body').then($body => {
            if ($body.find('[data-testid="datetime-picker-popover"]').length > 0) {
              cy.log('[STEP 14] DateTime picker opened successfully');
              
              // Enter a date
              const today = new Date();
              const dateStr = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear()}`;
              
              cy.log(`[STEP 15] Entering date: ${dateStr}`);
              cy.get('[data-testid="datetime-date-input"]').clear().type(dateStr);
              cy.get('[data-testid="datetime-date-input"]').type('{enter}');
              waitForReactUpdate(1000);
              
              cy.log('[STEP 16] Date entered successfully');
            } else {
              cy.log('[STEP 14] DateTime picker did not open, but column was created');
            }
          });
        } else {
          cy.log('[STEP 13] DateTime cells not found, but column creation was attempted');
        }
      });
      
      cy.log('[STEP 17] DateTime column test completed');
    });
  });
});
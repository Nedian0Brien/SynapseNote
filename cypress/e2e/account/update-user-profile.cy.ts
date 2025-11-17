import { AuthTestUtils } from '../../support/auth-utils';
import { WorkspaceSelectors, byTestId } from '../../support/selectors';
import { generateRandomEmail } from '../../support/test-config';

describe('Update User Profile', () => {
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

  it('should update user profile settings through Account Settings', () => {
    const testEmail = generateRandomEmail();

    // Login
    cy.log('Step 1: Logging in to the application');
    cy.visit('/login', { failOnStatusCode: false });
    cy.wait(2000);

    const authUtils = new AuthTestUtils();
    authUtils.signInWithTestUrl(testEmail).then(() => {
      // Wait for app to load
      cy.log('Step 2: Waiting for application to load');
      cy.url({ timeout: 30000 }).should('include', '/app');
      cy.wait(3000);

      // Open workspace dropdown
      cy.log('Step 3: Opening workspace dropdown');
      WorkspaceSelectors.dropdownTrigger().should('be.visible').click();

      // Wait for dropdown to open
      WorkspaceSelectors.dropdownContent().should('be.visible');

      // Click on Account Settings
      cy.log('Step 4: Opening Account Settings');
      cy.get(byTestId('account-settings-button')).should('be.visible').click();

      // Add a wait to ensure the dialog has time to open
      cy.wait(1000);

      // Wait for Account Settings dialog to open
      cy.log('Step 5: Verifying Account Settings dialog opened');
      cy.get(byTestId('account-settings-dialog'), { timeout: 10000 }).should('be.visible');

      // Check initial date format (should be Month/Day/Year)
      cy.log('Step 6: Checking initial date format');
      cy.get(byTestId('date-format-dropdown')).should('be.visible');

      // Test Date Format change - select Year/Month/Day
      cy.log('Step 7: Testing Date Format change to Year/Month/Day');
      cy.get(byTestId('date-format-dropdown')).click();
      cy.wait(500);

      // Select US format (value 1) which is Year/Month/Day
      cy.get(byTestId('date-format-1')).should('be.visible').click();
      cy.wait(3000); // Wait for API call to complete

      // Verify the dropdown now shows Year/Month/Day
      cy.get(byTestId('date-format-dropdown')).should('contain.text', 'Year/Month/Day');

      // Test Time Format change
      cy.log('Step 8: Testing Time Format change');
      cy.get(byTestId('time-format-dropdown')).should('be.visible').click();
      cy.wait(500);

      // Select 24-hour format (value 1)
      cy.get(byTestId('time-format-1')).should('be.visible').click();
      cy.wait(3000); // Wait for API call to complete

      // Verify the dropdown now shows 24-hour format
      cy.get(byTestId('time-format-dropdown')).should('contain.text', '24');

      // Test Start Week On change
      cy.log('Step 9: Testing Start Week On change');
      cy.get(byTestId('start-week-on-dropdown')).should('be.visible').click();
      cy.wait(500);

      // Select Monday (value 1)
      cy.get(byTestId('start-week-1')).should('be.visible').click();
      cy.wait(3000); // Wait for API call to complete

      cy.get(byTestId('start-week-on-dropdown')).should('contain.text', 'Monday');

      // The settings should remain selected in the current session
      cy.log('Step 10: Verifying all settings are showing correctly');

      // Verify all dropdowns still show the selected values
      cy.get(byTestId('date-format-dropdown')).should('contain.text', 'Year/Month/Day');
      cy.get(byTestId('time-format-dropdown')).should('contain.text', '24');
      cy.get(byTestId('start-week-on-dropdown')).should('contain.text', 'Monday');

      cy.log('Test completed: User profile settings updated successfully');
    });
  });
});

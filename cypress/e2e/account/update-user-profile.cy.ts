import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';

describe('Update User Profile', () => {
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

  it('should update user profile settings through Account Settings and verify persistence', () => {
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
      cy.get('[data-testid="workspace-dropdown-trigger"]', { timeout: 10000 }).should('be.visible').click();
      
      // Wait for dropdown to open
      cy.get('[data-testid="workspace-dropdown-content"]', { timeout: 5000 }).should('be.visible');

      // Click on Account Settings
      cy.log('Step 4: Opening Account Settings');
      cy.get('[data-testid="account-settings-button"]').should('be.visible').click();
      
      // Add a wait to ensure the dialog has time to open
      cy.wait(1000);

      // Wait for Account Settings dialog to open
      cy.log('Step 5: Verifying Account Settings dialog opened');
      cy.get('[data-testid="account-settings-dialog"]', { timeout: 10000 }).should('be.visible');

      // Test Date Format change
      cy.log('Step 6: Testing Date Format change');
      cy.get('[data-testid="date-format-dropdown"]').should('be.visible').click();
      cy.wait(500);
      
      // Select US format (value 1)
      cy.get('[data-testid="date-format-1"]').should('be.visible').click();
      cy.wait(1500); // Wait for API call to complete

      // Test Time Format change
      cy.log('Step 7: Testing Time Format change');
      cy.get('[data-testid="time-format-dropdown"]').should('be.visible').click();
      cy.wait(500);
      
      // Select 24-hour format (value 1)
      cy.get('[data-testid="time-format-1"]').should('be.visible').click();
      cy.wait(1500); // Wait for API call to complete

      // Test Start Week On change
      cy.log('Step 8: Testing Start Week On change');
      cy.get('[data-testid="start-week-on-dropdown"]').should('be.visible').click();
      cy.wait(500);
      
      // Select Monday (value 1)
      cy.get('[data-testid="start-week-1"]').should('be.visible').click();
      cy.wait(1500); // Wait for API call to complete

      // Close the dialog
      cy.log('Step 9: Closing Account Settings dialog');
      cy.get('body').type('{esc}');
      cy.wait(500);

      // Verify dialog is closed
      cy.get('[data-testid="account-settings-dialog"]').should('not.exist');

      // Re-open to verify settings were saved
      cy.log('Step 10: Re-opening Account Settings to verify changes');
      cy.get('[data-testid="workspace-dropdown-content"]', { timeout: 5000 }).should('be.visible');
      cy.get('[data-testid="account-settings-button"]').click();
      cy.wait(1000);
      cy.get('[data-testid="account-settings-dialog"]', { timeout: 10000 }).should('be.visible');

      // Verify the settings are still selected
      cy.log('Step 11: Verifying settings were saved');
      
      // Date format should show US format text
      cy.get('[data-testid="date-format-dropdown"]').should('contain.text', 'Year/Month/Day');
      
      // Time format should show 24-hour text
      cy.get('[data-testid="time-format-dropdown"]').should('contain.text', '24');
      
      // Start week should show Monday
      cy.get('[data-testid="start-week-on-dropdown"]').should('contain.text', 'Monday');

      cy.log('Step 12: Testing persistence after page refresh');
      
      // Close dialog
      cy.get('body').type('{esc}');
      cy.wait(500);
      
      // Refresh the page
      cy.log('Step 13: Refreshing the page');
      cy.reload();
      cy.wait(3000);

      // Re-open Account Settings
      cy.log('Step 14: Re-opening Account Settings after refresh');
      cy.get('[data-testid="workspace-dropdown-trigger"]', { timeout: 10000 }).should('be.visible').click();
      cy.get('[data-testid="workspace-dropdown-content"]', { timeout: 5000 }).should('be.visible');
      cy.get('[data-testid="account-settings-button"]').click();
      cy.wait(1000);
      cy.get('[data-testid="account-settings-dialog"]', { timeout: 10000 }).should('be.visible');

      // Verify settings persisted
      cy.log('Step 15: Verifying settings persisted after refresh');
      cy.get('[data-testid="date-format-dropdown"]').should('contain.text', 'Year/Month/Day');
      cy.get('[data-testid="time-format-dropdown"]').should('contain.text', '24');
      cy.get('[data-testid="start-week-on-dropdown"]').should('contain.text', 'Monday');

      cy.log('Test completed: User profile settings updated and persisted successfully');
    });
  });
});
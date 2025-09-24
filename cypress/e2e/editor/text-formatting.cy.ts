import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';
import { EditorSelectors, waitForReactUpdate } from '../../support/selectors';

describe('Text Formatting - Selection and Formatting', () => {
  const generateRandomEmail = () => `${uuidv4()}@appflowy.io`;

  beforeEach(() => {
    cy.on('uncaught:exception', () => false);
    cy.viewport(1280, 720);
  });

  it('should apply all formatting styles to text', () => {
    const testEmail = generateRandomEmail();

    // Login
    cy.visit('/login', { failOnStatusCode: false });
    cy.wait(2000);

    const authUtils = new AuthTestUtils();
    authUtils.signInWithTestUrl(testEmail).then(() => {
      cy.url({ timeout: 30000 }).should('include', '/app');
      cy.wait(3000);

      // Navigate to Getting started page
      cy.contains('Getting started').click();
      cy.wait(5000); // Give page time to fully load

      // Focus on editor and ensure it's ready
      EditorSelectors.slateEditor().should('exist').and('be.visible');
      cy.wait(2000); // Extra wait for CI environment
      EditorSelectors.slateEditor().click();
      waitForReactUpdate(2000);

      // Clear existing content
      cy.focused().type('{selectall}{backspace}');
      waitForReactUpdate(1000); // Give more time for content to clear

      // Test 1: Bold text
      cy.log('Testing BOLD formatting');
      cy.focused().type('This line is bold');
      waitForReactUpdate(1000);
      cy.focused().type('{selectall}');
      waitForReactUpdate(500);
      cy.focused().type('{cmd+b}');
      waitForReactUpdate(1000);
      // Wait for the strong element to appear with retry and longer timeout
      cy.get('strong', { timeout: 15000 }).should('exist').and('be.visible');
      cy.focused().type('{end}{enter}');
      waitForReactUpdate(1000);

      // Test 2: Italic text
      cy.log('Testing ITALIC formatting');
      cy.focused().type('This line is italic');
      waitForReactUpdate(1000);
      cy.focused().type('{selectall}');
      waitForReactUpdate(500);
      cy.focused().type('{cmd+i}');
      waitForReactUpdate(1000);
      // Wait for the em element to appear with retry and longer timeout
      cy.get('em', { timeout: 15000 }).should('exist').and('be.visible');
      cy.focused().type('{end}{enter}');
      waitForReactUpdate(1000);

      // Test 3: Underline text
      cy.log('Testing UNDERLINE formatting');
      cy.focused().type('This line is underlined');
      waitForReactUpdate(1000);
      cy.focused().type('{selectall}');
      waitForReactUpdate(500);
      cy.focused().type('{cmd+u}');
      waitForReactUpdate(1000);
      // Wait for the u element to appear with retry and longer timeout
      cy.get('u', { timeout: 15000 }).should('exist').and('be.visible');
      cy.focused().type('{end}{enter}');
      waitForReactUpdate(1000);

      // Test 4: Strikethrough text
      cy.log('Testing STRIKETHROUGH formatting');
      cy.focused().type('This line has strikethrough');
      waitForReactUpdate(1000);
      cy.focused().type('{selectall}');
      waitForReactUpdate(500);
      cy.focused().type('{shift+cmd+s}');
      waitForReactUpdate(1000);
      // Wait for the strikethrough element to appear with retry and longer timeout
      cy.get('s, del, strike, [style*="text-decoration: line-through"]', { timeout: 15000 }).should('exist').and('be.visible');

      // Final verification - all formatted elements should be visible
      cy.log('Verifying all formatted text is visible');
      waitForReactUpdate(2000);
      cy.get('strong', { timeout: 15000 }).should('exist').and('be.visible').and('contain.text', 'bold');
      cy.get('em', { timeout: 15000 }).should('exist').and('be.visible').and('contain.text', 'italic');
      cy.get('u', { timeout: 15000 }).should('exist').and('be.visible').and('contain.text', 'underlined');
      cy.get('s, del, strike, [style*="text-decoration: line-through"]', { timeout: 15000 }).should('exist').and('be.visible');

      // Take screenshot to verify all lines are visible
      cy.screenshot('all-formatted-lines-visible');

      cy.log('All text formatting styles tested successfully - each line shows a different style');
    });
  });
});
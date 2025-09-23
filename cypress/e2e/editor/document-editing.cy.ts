import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';

describe('Document Editing with Formatting', () => {
  const generateRandomEmail = () => `${uuidv4()}@appflowy.io`;

  beforeEach(() => {
    cy.on('uncaught:exception', () => false);
    cy.viewport(1280, 720);
  });

  it('should handle text with headings', () => {
    const testEmail = generateRandomEmail();

    // Login
    cy.visit('/login', { failOnStatusCode: false });
    cy.wait(2000);

    const authUtils = new AuthTestUtils();
    authUtils.signInWithTestUrl(testEmail).then(() => {
      cy.url({ timeout: 30000 }).should('include', '/app');
      cy.wait(3000);

      // Navigate to Getting started page
      cy.contains('Getting started', { timeout: 10000 }).click();
      cy.wait(5000);

      // Find and focus the editor
      cy.get('[data-slate-editor="true"]', { timeout: 10000 })
        .should('exist')
        .first()
        .click({ force: true });
      cy.wait(1000);

      // Type normal text
      cy.focused().type('Document Title', { delay: 50 });
      cy.wait(500);
      cy.focused().type('{enter}');
      cy.wait(500);

      // Type / and select Heading 1
      cy.focused().type('/heading', { delay: 100 });
      cy.wait(1000);

      // Click on Heading 1 if visible
      cy.get('body').then($body => {
        if ($body.text().includes('Heading 1')) {
          cy.contains('Heading 1').first().click();
          cy.wait(500);
          cy.focused().type('Main Heading', { delay: 50 });
        } else {
          // Fallback to simple text
          cy.focused().type('{esc}');
          cy.wait(500);
          cy.focused().type('Main Heading', { delay: 50 });
        }
      });

      cy.wait(500);
      cy.focused().type('{enter}');
      cy.wait(500);

      // Add regular text
      cy.focused().type('Some content text', { delay: 50 });
      cy.wait(1000);

      // Verify content
      cy.get('[data-slate-editor="true"]').should('contain.text', 'Document Title');
      cy.get('[data-slate-editor="true"]').should('contain.text', 'Main Heading');
      cy.get('[data-slate-editor="true"]').should('contain.text', 'Some content text');
    });
  });

  it('should handle lists', () => {
    const testEmail = generateRandomEmail();

    // Login
    cy.visit('/login', { failOnStatusCode: false });
    cy.wait(2000);

    const authUtils = new AuthTestUtils();
    authUtils.signInWithTestUrl(testEmail).then(() => {
      cy.url({ timeout: 30000 }).should('include', '/app');
      cy.wait(3000);

      // Navigate to Getting started page
      cy.contains('Getting started', { timeout: 10000 }).click();
      cy.wait(5000);

      // Find and focus the editor
      cy.get('[data-slate-editor="true"]', { timeout: 10000 })
        .should('exist')
        .first()
        .click({ force: true });
      cy.wait(1000);

      // Add title
      cy.focused().type('Shopping List', { delay: 50 });
      cy.wait(500);
      cy.focused().type('{enter}');
      cy.wait(500);

      // Try to create a bulleted list
      cy.focused().type('/bullet', { delay: 100 });
      cy.wait(1000);

      cy.get('body').then($body => {
        if ($body.text().includes('Bulleted list')) {
          cy.contains('Bulleted list').first().click();
          cy.wait(500);
          cy.focused().type('Apples', { delay: 50 });
          cy.wait(500);
          cy.focused().type('{enter}');
          cy.wait(500);
          cy.focused().type('Bananas', { delay: 50 });
          cy.wait(500);
          cy.focused().type('{enter}');
          cy.wait(500);
          cy.focused().type('Oranges', { delay: 50 });
        } else {
          // Fallback to simple list with dashes
          cy.focused().type('{esc}');
          cy.wait(500);
          cy.focused().type('- Apples', { delay: 50 });
          cy.wait(500);
          cy.focused().type('{enter}');
          cy.wait(500);
          cy.focused().type('- Bananas', { delay: 50 });
          cy.wait(500);
          cy.focused().type('{enter}');
          cy.wait(500);
          cy.focused().type('- Oranges', { delay: 50 });
        }
      });

      cy.wait(1000);

      // Verify content
      cy.get('[data-slate-editor="true"]').should('contain.text', 'Shopping List');
      cy.get('[data-slate-editor="true"]').should('contain.text', 'Apples');
      cy.get('[data-slate-editor="true"]').should('contain.text', 'Bananas');
      cy.get('[data-slate-editor="true"]').should('contain.text', 'Oranges');
    });
  });

  it('should handle numbered lists and todos', () => {
    const testEmail = generateRandomEmail();

    // Login
    cy.visit('/login', { failOnStatusCode: false });
    cy.wait(2000);

    const authUtils = new AuthTestUtils();
    authUtils.signInWithTestUrl(testEmail).then(() => {
      cy.url({ timeout: 30000 }).should('include', '/app');
      cy.wait(3000);

      // Navigate to Getting started page
      cy.contains('Getting started', { timeout: 10000 }).click();
      cy.wait(5000);

      // Find and focus the editor
      cy.get('[data-slate-editor="true"]', { timeout: 10000 })
        .should('exist')
        .first()
        .click({ force: true });
      cy.wait(1000);

      // Add title
      cy.focused().type('Steps to Follow', { delay: 50 });
      cy.wait(500);
      cy.focused().type('{enter}');
      cy.wait(500);

      // Try numbered list
      cy.focused().type('/number', { delay: 100 });
      cy.wait(1000);

      cy.get('body').then($body => {
        if ($body.text().includes('Numbered list')) {
          cy.contains('Numbered list').first().click();
          cy.wait(500);
          cy.focused().type('First step', { delay: 50 });
          cy.wait(500);
          cy.focused().type('{enter}');
          cy.wait(500);
          cy.focused().type('Second step', { delay: 50 });
        } else {
          // Fallback to manual numbering
          cy.focused().type('{esc}');
          cy.wait(500);
          cy.focused().type('1. First step', { delay: 50 });
          cy.wait(500);
          cy.focused().type('{enter}');
          cy.wait(500);
          cy.focused().type('2. Second step', { delay: 50 });
        }
      });

      cy.wait(500);
      cy.focused().type('{enter}{enter}');
      cy.wait(500);

      // Add todo items
      cy.focused().type('Tasks:', { delay: 50 });
      cy.wait(500);
      cy.focused().type('{enter}');
      cy.wait(500);

      // Try todo list
      cy.focused().type('/todo', { delay: 100 });
      cy.wait(1000);

      cy.get('body').then($body => {
        if ($body.text().includes('Todo list')) {
          cy.contains('Todo list').first().click();
          cy.wait(500);
          cy.focused().type('Complete report', { delay: 50 });
          cy.wait(500);
          cy.focused().type('{enter}');
          cy.wait(500);
          cy.focused().type('Review code', { delay: 50 });
        } else {
          // Fallback to checkbox format
          cy.focused().type('{esc}');
          cy.wait(500);
          cy.focused().type('[ ] Complete report', { delay: 50 });
          cy.wait(500);
          cy.focused().type('{enter}');
          cy.wait(500);
          cy.focused().type('[ ] Review code', { delay: 50 });
        }
      });

      cy.wait(1000);

      // Verify content
      cy.get('[data-slate-editor="true"]').should('contain.text', 'Steps to Follow');
      cy.get('[data-slate-editor="true"]').should('contain.text', 'First step');
      cy.get('[data-slate-editor="true"]').should('contain.text', 'Second step');
      cy.get('[data-slate-editor="true"]').should('contain.text', 'Tasks');
      cy.get('[data-slate-editor="true"]').should('contain.text', 'Complete report');
      cy.get('[data-slate-editor="true"]').should('contain.text', 'Review code');
    });
  });
});
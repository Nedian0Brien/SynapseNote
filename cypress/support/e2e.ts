// ***********************************************************
// This example support/e2e.ts is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import 'cypress-file-upload';
import 'cypress-plugin-api';
import 'cypress-real-events';
import './commands';
import { CollabWebSocketMock } from './websocket-collab-mock';


// Install WebSocket mock before window loads if enabled
if (Cypress.env('MOCK_WEBSOCKET') === true || Cypress.env('MOCK_WEBSOCKET') === 'true') {
  const delay = parseInt(Cypress.env('WS_RESPONSE_DELAY') || '50');

  Cypress.on('window:before:load', (win) => {
    // Install mock on every window load
    if (!(win as any).__collabMockInstance) {
      (win as any).__collabMockInstance = new CollabWebSocketMock(win as any, delay);
      // eslint-disable-next-line no-console
      console.log('[E2E] Collab WebSocket mock installed on window:', win.location.href);
    }
  });
}

// Global hooks for console logging
beforeEach(() => {
  // Start capturing console logs for each test
  cy.startConsoleCapture();

  // Log if WebSocket mocking is enabled
  if (Cypress.env('MOCK_WEBSOCKET') === true || Cypress.env('MOCK_WEBSOCKET') === 'true') {
    cy.task('log', 'Collab WebSocket mocking enabled for this test');
    cy.log('Collab WebSocket mocking enabled');
  }
});

afterEach(() => {
  // Print console logs summary after each test
  // This ensures logs are visible in CI output even if the test fails
  cy.printConsoleLogsSummary();

  // Stop capturing to clean up
  cy.stopConsoleCapture();

  // Restore WebSocket if it was mocked
  if (Cypress.env('MOCK_WEBSOCKET') === true || Cypress.env('MOCK_WEBSOCKET') === 'true') {
    cy.restoreCollabWebSocket();
  }
});

// Globally ignore transient app bootstrap errors during tests
Cypress.on('uncaught:exception', (err) => {
  if (
    err.message.includes('No workspace or service found') ||
    err.message.includes('Failed to fetch dynamically imported module') ||
    /Record not found|unknown error/i.test(err.message) ||
    err.message.includes('Reduce of empty array with no initial value')
  ) {
    return false;
  }
  return true;
});
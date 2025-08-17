/// <reference types="cypress" />

// Import auth utilities
import './auth-utils';
// Import page utilities
import './page-utils';
// Import console logger v2 (improved version)
import './console-logger';
// Import WebSocket mock utilities
import './websocket-mock';
// Import WebSocket collab mock for document sync
import './websocket-collab-mock';

// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

Cypress.Commands.add('mockAPI', () => {
  // Mock the API
});

export {};

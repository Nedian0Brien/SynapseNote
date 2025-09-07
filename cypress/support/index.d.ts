/// <reference types="cypress" />

declare namespace Cypress {
  interface Chainable {
    /**
     * Custom command type declarations
     */
  }

  interface Cypress {
    cy?: Chainable;
  }
}

// Add proper typing for JQuery elements
declare global {
  interface JQuery<TElement = HTMLElement> {
    [index: number]: TElement;
  }
}
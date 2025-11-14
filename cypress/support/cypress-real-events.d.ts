/// <reference types="cypress" />

declare namespace Cypress {
  interface Chainable {
    /**
     * Simulates real hover event using Chrome DevTools Protocol
     */
    realHover(options?: {
      /**
       * Position of the hover relative to the element
       */
      position?: 'topLeft' | 'top' | 'topRight' | 'left' | 'center' | 'right' | 'bottomLeft' | 'bottom' | 'bottomRight';
      /**
       * Pointer type for the hover
       */
      pointer?: 'mouse' | 'pen';
      /**
       * Scroll behavior
       */
      scrollBehavior?: 'center' | 'top' | 'bottom' | 'nearest' | false;
    }): Chainable<Element>;

    /**
     * Simulates real click event using Chrome DevTools Protocol
     */
    realClick(options?: {
      button?: 'left' | 'middle' | 'right';
      clickCount?: number;
      position?: 'topLeft' | 'top' | 'topRight' | 'left' | 'center' | 'right' | 'bottomLeft' | 'bottom' | 'bottomRight';
      x?: number;
      y?: number;
      pointer?: 'mouse' | 'pen';
      scrollBehavior?: 'center' | 'top' | 'bottom' | 'nearest' | false;
    }): Chainable<Element>;

    /**
     * Simulates real mouse press event using Chrome DevTools Protocol
     */
    realPress(key: string | string[], options?: {
      delay?: number;
      pressDelay?: number;
      log?: boolean;
    }): Chainable<Element>;

    /**
     * Simulates real type event using Chrome DevTools Protocol
     */
    realType(text: string, options?: {
      delay?: number;
      pressDelay?: number;
      log?: boolean;
    }): Chainable<Element>;
  }
}
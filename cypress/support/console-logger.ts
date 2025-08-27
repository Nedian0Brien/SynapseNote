/// <reference types="cypress" />

interface ConsoleLog {
  type: string;
  args: any[];
  timestamp: string;
  url?: string;
}

// Store captured console logs globally
let consoleLogs: ConsoleLog[] = [];
let isCapturing = false;

// Helper to stringify arguments for better readability
function stringifyArgs(args: any[]): string {
  return args.map(arg => {
    try {
      if (typeof arg === 'object' && arg !== null) {
        return JSON.stringify(arg, null, 2);
      }
      return String(arg);
    } catch (e) {
      return '[Object]';
    }
  }).join(' ');
}

// Install console interceptors on window
function installConsoleInterceptors(win: any) {
  const methods: (keyof Console)[] = ['log', 'error', 'warn'];
  
  methods.forEach((method) => {
    const originalMethod = (win.console[method] as Function).bind(win.console);
    
    // Override the console method
    win.console[method] = (...args: any[]) => {
      if (isCapturing) {
        // Store the log
        const logEntry: ConsoleLog = {
          type: method,
          args: args,
          timestamp: new Date().toISOString(),
          url: win.location.href
        };
        consoleLogs.push(logEntry);
        
        // Immediately output to Cypress task for CI visibility
        const message = stringifyArgs(args);
        const logMessage = `[${new Date().toISOString()}] [CONSOLE.${method.toUpperCase()}] ${message}`;
        
        // Log to Node.js console directly
        console.log(logMessage);
        
        // Also use cy.task for guaranteed CI visibility (if available)
        try {
          // Check if we're in a Cypress context and can use cy.task
          if (typeof Cypress !== 'undefined' && Cypress.cy) {
            Cypress.cy.task('log', logMessage, { log: false }).catch(() => {
              // Ignore errors if cy.task is not available in current context
            });
          }
        } catch (e) {
          // Ignore errors if Cypress is not available
        }
      }
      
      // Call original method
      return originalMethod(...args);
    };
  });
}

// Start capturing console logs
Cypress.Commands.add('startConsoleCapture', () => {
  consoleLogs = [];
  isCapturing = true;
  
  // Check if we're in CI environment
  const isCi = Cypress.env('CI') || Cypress.env('GITHUB_ACTIONS');
  cy.task('log', `[CONSOLE-LOGGER] Starting console capture (CI: ${!!isCi})`);
  
  // Install on current window
  cy.window({ log: false }).then((win) => {
    installConsoleInterceptors(win);
    
    // Test console capture immediately in CI
    if (isCi) {
      cy.task('log', '[CONSOLE-LOGGER] Console interceptors installed, testing...');
      win.console.log('🧪 TEST: Console capture is working in CI environment');
    }
  });
  
  // Install on all future windows (navigation, reload, etc.)
  Cypress.on('window:before:load', (win) => {
    installConsoleInterceptors(win);
  });
  
  cy.log('Console capture started');
});

// Stop capturing console logs
Cypress.Commands.add('stopConsoleCapture', () => {
  isCapturing = false;
  cy.log('Console capture stopped');
});

// Get all captured logs
Cypress.Commands.add('getConsoleLogs', () => {
  return cy.wrap(consoleLogs, { log: false });
});

// Print captured logs summary
Cypress.Commands.add('printConsoleLogsSummary', () => {
  const summary = {
    total: consoleLogs.length,
    errors: consoleLogs.filter(l => l.type === 'error').length,
    warnings: consoleLogs.filter(l => l.type === 'warn').length,
    logs: consoleLogs.filter(l => l.type === 'log').length,
    info: consoleLogs.filter(l => l.type === 'info').length,
    debug: consoleLogs.filter(l => l.type === 'debug').length
  };
  
  // Enhanced logging summary for CI visibility
  const isCi = Cypress.env('CI') || Cypress.env('GITHUB_ACTIONS');
  
  cy.task('log', '=== Console Logs Summary ===');
  cy.task('log', `Total logs captured: ${summary.total}`);
  cy.task('log', `  - Errors: ${summary.errors}`);
  cy.task('log', `  - Warnings: ${summary.warnings}`);
  cy.task('log', `  - Logs: ${summary.logs}`);
  cy.task('log', `  - Info: ${summary.info}`);
  cy.task('log', `  - Debug: ${summary.debug}`);
  
  if (isCi && summary.total === 0) {
    cy.task('log', '⚠️  WARNING: No console logs captured in CI environment!');
    cy.task('log', '   This might indicate console interceptor is not working properly.');
    cy.task('log', '   Check if the web app is loading correctly in CI.');
  }
  
  // Print all logs
  if (consoleLogs.length > 0) {
    cy.task('log', '=== Captured Console Logs ===');
    consoleLogs.forEach((log, index) => {
      const message = stringifyArgs(log.args);
      cy.task('log', `[${index + 1}] ${log.timestamp} [${log.type.toUpperCase()}] (${log.url || 'unknown'}): ${message}`);
    });
    cy.task('log', '=== End of Console Logs ===');
  } else {
    cy.task('log', 'No console logs were captured');
  }
});

// Clear captured logs
Cypress.Commands.add('clearConsoleLogs', () => {
  consoleLogs = [];
});

// Add TypeScript definitions
declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Start capturing console logs from the application
       */
      startConsoleCapture(): Chainable<void>;
      
      /**
       * Stop capturing console logs
       */
      stopConsoleCapture(): Chainable<void>;
      
      /**
       * Get all captured console logs
       */
      getConsoleLogs(): Chainable<ConsoleLog[]>;
      
      /**
       * Print a summary of captured console logs
       */
      printConsoleLogsSummary(): Chainable<void>;
      
      /**
       * Clear all captured console logs
       */
      clearConsoleLogs(): Chainable<void>;
    }
  }
}

export {};
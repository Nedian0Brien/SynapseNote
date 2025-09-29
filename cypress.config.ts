import { defineConfig } from 'cypress';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export default defineConfig({
  env: {
    codeCoverage: {
      exclude: ['cypress/**/*.*', '**/__tests__/**/*.*', '**/*.test.*'],
    },
    // Backend URL configuration - load from .env or use defaults
    APPFLOWY_BASE_URL: process.env.APPFLOWY_BASE_URL || 'http://localhost',
    APPFLOWY_GOTRUE_BASE_URL: process.env.APPFLOWY_GOTRUE_BASE_URL || 'http://localhost/gotrue',
    APPFLOWY_WS_BASE_URL: process.env.APPFLOWY_WS_BASE_URL || 'ws://localhost/ws/v2',
    GOTRUE_ADMIN_EMAIL: process.env.GOTRUE_ADMIN_EMAIL || 'admin@example.com',
    GOTRUE_ADMIN_PASSWORD: process.env.GOTRUE_ADMIN_PASSWORD || 'password',
  },
  e2e: {
    chromeWebSecurity: false,
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:3000',
    // Set viewport to MacBook Pro screen size
    viewportWidth: 1440,
    viewportHeight: 900,
    setupNodeEvents(on, config) {
      // Configure browser launch options
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.family === 'chromium' && browser.name !== 'electron') {
          // Remove --start-fullscreen flag and set window size
          launchOptions.args = launchOptions.args.filter(arg => !arg.includes('--start-fullscreen'));
          launchOptions.args.push('--window-size=1440,900');
          launchOptions.args.push('--window-position=100,100');

          // Disable kiosk mode
          const kioskIndex = launchOptions.args.indexOf('--kiosk');
          if (kioskIndex > -1) {
            launchOptions.args.splice(kioskIndex, 1);
          }
        }
        return launchOptions;
      });
      // Override baseUrl if CYPRESS_BASE_URL is set
      if (process.env.CYPRESS_BASE_URL) {
        config.baseUrl = process.env.CYPRESS_BASE_URL;
      }

      // Pass environment variables to Cypress
      config.env.APPFLOWY_BASE_URL = process.env.APPFLOWY_BASE_URL || config.env.APPFLOWY_BASE_URL;
      config.env.APPFLOWY_GOTRUE_BASE_URL = process.env.APPFLOWY_GOTRUE_BASE_URL || config.env.APPFLOWY_GOTRUE_BASE_URL;
      config.env.APPFLOWY_WS_BASE_URL = process.env.APPFLOWY_WS_BASE_URL || config.env.APPFLOWY_WS_BASE_URL;
      config.env.GOTRUE_ADMIN_EMAIL = process.env.GOTRUE_ADMIN_EMAIL || config.env.GOTRUE_ADMIN_EMAIL;
      config.env.GOTRUE_ADMIN_PASSWORD = process.env.GOTRUE_ADMIN_PASSWORD || config.env.GOTRUE_ADMIN_PASSWORD;

      // Add task for logging to Node.js console
      on('task', {
        log(message) {
          console.log(message);
          return null;
        },
        async httpCheck({ url, method = 'HEAD' }) {
          try {
            const response = await fetch(url, { method });

            return response.ok;
          } catch (error) {
            return false;
          }
        },
      });

      return config;
    },
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
  },
  watchForFileChanges: false,
  // Increase timeouts for CI stability
  defaultCommandTimeout: 10000,
  requestTimeout: 10000,
  responseTimeout: 10000,
  component: {
    devServer: {
      framework: 'react',
      bundler: 'vite',
    },
    setupNodeEvents(on, config) {
      // Add event listeners for better debugging
      on('task', {
        log(message) {
          console.log(message);
          return null;
        },
        failed(message) {
          console.error('Test failed:', message);
          return null;
        },
      });
      
      // Modify config for CI environment
      if (process.env.CI) {
        config.defaultCommandTimeout = 15000;
        config.requestTimeout = 15000;
        config.responseTimeout = 15000;
        config.video = false;
        config.screenshotOnRunFailure = true;
      }
      
      return config;
    },
    supportFile: 'cypress/support/component.ts',
    specPattern: 'cypress/components/**/*.cy.{ts,tsx}',
    // Viewport size for component tests
    viewportWidth: 1280,
    viewportHeight: 720,
  },
  chromeWebSecurity: false,
  retries: {
    runMode: 3,
    openMode: 0,
  },
});

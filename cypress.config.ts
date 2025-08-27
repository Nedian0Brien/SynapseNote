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
    // WebSocket mocking configuration
    MOCK_WEBSOCKET: process.env.MOCK_WEBSOCKET === 'true' || false,
    WS_AUTO_RESPOND: process.env.WS_AUTO_RESPOND === 'true' || false,
    WS_RESPONSE_DELAY: process.env.WS_RESPONSE_DELAY || '100',
  },
  e2e: {
    chromeWebSecurity: false,
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:3000',
    // Set viewport to MacBook Pro screen size
    viewportWidth: 1440,
    viewportHeight: 900,
    setupNodeEvents(on, config) {
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
      // Pass WebSocket mock configuration
      config.env.MOCK_WEBSOCKET = process.env.MOCK_WEBSOCKET === 'true' || config.env.MOCK_WEBSOCKET;
      config.env.WS_AUTO_RESPOND = process.env.WS_AUTO_RESPOND === 'true' || config.env.WS_AUTO_RESPOND;
      config.env.WS_RESPONSE_DELAY = process.env.WS_RESPONSE_DELAY || config.env.WS_RESPONSE_DELAY;

      // Add task for logging to Node.js console
      on('task', {
        log(message) {
          console.log(message);
          return null;
        },
        async httpCheck({ url, method = 'HEAD' }: { url: string; method?: string }) {
          try {
            const response = await fetch(url, { method: method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'PATCH' });

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
  component: {
    devServer: {
      framework: 'react',
      bundler: 'vite',
    },
    setupNodeEvents(on, config) {
      return config;
    },
    supportFile: 'cypress/support/component.ts',
  },
  chromeWebSecurity: false,
  retries: {
    runMode: 0,
    openMode: 0,
  },
});

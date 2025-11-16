/**
 * Shared decorators for Storybook stories
 *
 * This file contains reusable decorator functions to avoid duplication across story files.
 * Import and use these decorators in your stories.
 */

import React, { useEffect } from 'react';

import { AppContext } from '@/components/app/app.hooks';
import { AFConfigContext } from '@/components/main/app.hooks';
import { mockAFConfigValue, mockAFConfigValueMinimal, mockAppContextValue } from './mocks';

/**
 * Hostname mocking utilities
 */
declare global {
  interface Window {
    __STORYBOOK_MOCK_HOSTNAME__?: string;
  }
}

export const mockHostname = (hostname: string) => {
  window.__STORYBOOK_MOCK_HOSTNAME__ = hostname;
};

/**
 * Decorator that provides AFConfigContext with mock values
 * Use this for components that need authentication context
 */
export const withAFConfig = (Story: React.ComponentType) => (
  <AFConfigContext.Provider value={mockAFConfigValue}>
    <Story />
  </AFConfigContext.Provider>
);

/**
 * Decorator that provides AFConfigContext with minimal mock values (no service)
 * Use this for components that need auth but not service functionality
 */
export const withAFConfigMinimal = (Story: React.ComponentType) => (
  <AFConfigContext.Provider value={mockAFConfigValueMinimal}>
    <Story />
  </AFConfigContext.Provider>
);

/**
 * Decorator that provides AppContext with mock values
 * Use this for components that need workspace and app state
 */
export const withAppContext = (Story: React.ComponentType) => (
  <AppContext.Provider value={mockAppContextValue}>
    <Story />
  </AppContext.Provider>
);

/**
 * Decorator that provides both AFConfig and AppContext
 * Use this for components that need both contexts
 */
export const withContexts = (Story: React.ComponentType) => (
  <AFConfigContext.Provider value={mockAFConfigValue}>
    <AppContext.Provider value={mockAppContextValue}>
      <Story />
    </AppContext.Provider>
  </AFConfigContext.Provider>
);

/**
 * Decorator that provides both AFConfig (minimal) and AppContext
 * Use this for components that need both contexts but not service
 */
export const withContextsMinimal = (Story: React.ComponentType) => (
  <AFConfigContext.Provider value={mockAFConfigValueMinimal}>
    <AppContext.Provider value={mockAppContextValue}>
      <Story />
    </AppContext.Provider>
  </AFConfigContext.Provider>
);

/**
 * Higher-order decorator for hostname mocking
 * Use this for components that behave differently based on hostname (official vs self-hosted)
 *
 * @example
 * decorators: [withHostnameMocking()]
 */
export const withHostnameMocking = () => {
  return (Story: React.ComponentType, context: { args: { hostname?: string } }) => {
    const hostname = context.args.hostname || 'beta.appflowy.cloud';

    // Set mock hostname synchronously before render
    mockHostname(hostname);

    useEffect(() => {
      // Update if hostname changes
      mockHostname(hostname);
      // Cleanup
      return () => {
        delete (window as any).__STORYBOOK_MOCK_HOSTNAME__;
      };
    }, [hostname]);

    return <Story />;
  };
};

/**
 * Combined decorator: hostname mocking + both contexts
 * Common pattern for components that need contexts and hostname mocking
 *
 * @param options.padding - Add padding around the story (default: '20px')
 * @param options.maxWidth - Maximum width of the story container
 * @param options.minimalAFConfig - Use minimal AFConfig (no service)
 */
export const withHostnameAndContexts = (options?: {
  padding?: string;
  maxWidth?: string;
  minimalAFConfig?: boolean;
}) => {
  const { padding = '20px', maxWidth, minimalAFConfig = false } = options || {};

  return (Story: React.ComponentType, context: { args: { hostname?: string } }) => {
    const hostname = context.args.hostname || 'beta.appflowy.cloud';

    // Set mock hostname synchronously before render
    mockHostname(hostname);

    useEffect(() => {
      mockHostname(hostname);
      return () => {
        delete (window as any).__STORYBOOK_MOCK_HOSTNAME__;
      };
    }, [hostname]);

    const afConfigValue = minimalAFConfig ? mockAFConfigValueMinimal : mockAFConfigValue;

    return (
      <AFConfigContext.Provider value={afConfigValue}>
        <AppContext.Provider value={mockAppContextValue}>
          <div style={{ padding, ...(maxWidth && { maxWidth }) }}>
            <Story />
          </div>
        </AppContext.Provider>
      </AFConfigContext.Provider>
    );
  };
};

/**
 * Decorator that adds a padded container
 * Use this for consistent spacing around components
 */
export const withPadding = (padding = '20px') => {
  return (Story: React.ComponentType) => (
    <div style={{ padding }}>
      <Story />
    </div>
  );
};

/**
 * Decorator that adds a padded container with max width
 * Use this for components that should be constrained
 */
export const withContainer = (options?: { padding?: string; maxWidth?: string }) => {
  const { padding = '20px', maxWidth = '600px' } = options || {};

  return (Story: React.ComponentType) => (
    <div style={{ padding, maxWidth }}>
      <Story />
    </div>
  );
};

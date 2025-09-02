import { AxiosRequestConfig } from 'axios';

/**
 * Extended axios config that includes custom options
 */
export interface ExtendedAxiosConfig extends AxiosRequestConfig {
  /**
   * Whether to show error notifications for this request
   * Default: false
   */
  showNotification?: boolean;
  
  /**
   * Custom error message to show instead of the default API error message
   */
  customErrorMessage?: string;
  
  /**
   * Whether to throw errors or silently handle them
   * Default: true
   */
  throwError?: boolean;
}

/**
 * Helper function to create axios config with notification enabled
 */
export function withNotification(config?: ExtendedAxiosConfig): ExtendedAxiosConfig {
  return {
    ...config,
    showNotification: true,
  };
}

/**
 * Helper function to create axios config with custom error message
 */
export function withCustomError(message: string, config?: ExtendedAxiosConfig): ExtendedAxiosConfig {
  return {
    ...config,
    customErrorMessage: message,
    showNotification: true,
  };
}
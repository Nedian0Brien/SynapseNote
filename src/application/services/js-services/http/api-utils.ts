import { AppResponseError, ErrorCode, apiErrorHandler } from './error-handler';

export interface ApiResponse<T = unknown> {
  code: number;
  data?: T;
  message: string;
}

/**
 * Process API response and handle errors consistently
 */
export async function processApiResponse<T>(
  response: ApiResponse<T>,
  options?: {
    showNotification?: boolean;
    throwError?: boolean;
    customMessage?: string;
    onAuthError?: () => void;
    onPermissionError?: () => void;
  }
): Promise<T> {
  if (response.code === ErrorCode.Ok) {
    if (response.data === undefined) {
      const error: AppResponseError = {
        code: ErrorCode.MissingPayload,
        message: 'Response data is missing'
      };

      await apiErrorHandler.handleError(error, options);
      throw error;
    }

    return response.data;
  }

  const error: AppResponseError = {
    code: response.code || ErrorCode.Unhandled,
    message: response.message || 'An error occurred'
  };

  await apiErrorHandler.handleError(error, options);
  throw error;
}

/**
 * Process void API response (no data expected)
 */
export async function processVoidApiResponse(
  response: ApiResponse<unknown>,
  options?: Parameters<typeof processApiResponse>[1]
): Promise<void> {
  if (response.code === ErrorCode.Ok) {
    return;
  }

  const error: AppResponseError = {
    code: response.code || ErrorCode.Unhandled,
    message: response.message || 'An error occurred'
  };

  await apiErrorHandler.handleError(error, options);
  throw error;
}

/**
 * Wrap API call with automatic error handling
 */
export async function apiCall<T>(
  fn: () => Promise<ApiResponse<T>>,
  options?: Parameters<typeof processApiResponse>[1]
): Promise<T> {
  try {
    const response = await fn();

    return await processApiResponse(response, options);
  } catch (error: unknown) {
    // If it's already an AppResponseError, just re-throw
    if ((error as AppResponseError)?.code !== undefined) {
      throw error;
    }
    
    // Otherwise, wrap in a generic error
    const apiError: AppResponseError = {
      code: ErrorCode.Unhandled,
      message: (error as Error)?.message || 'An unexpected error occurred'
    };
    
    await apiErrorHandler.handleError(apiError, options);
    throw apiError;
  }
}

/**
 * Create a standardized API error
 */
export function createApiError(
  code: ErrorCode = ErrorCode.Unhandled,
  message?: string
): AppResponseError {
  return {
    code,
    message: message || 'An error occurred'
  };
}
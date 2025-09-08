import { AppResponseError, ErrorCode, apiErrorHandler } from './error-handler';

export interface ApiResponse<T = unknown> {
  code: ErrorCode;
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
    code: Object.values(ErrorCode).includes(response.code) ? response.code : ErrorCode.Unhandled,
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
    code: Object.values(ErrorCode).includes(response.code) ? response.code : ErrorCode.Unhandled,
    message: response.message || 'An error occurred'
  };

  await apiErrorHandler.handleError(error, options);
  throw error;
}

/**
 * Internal API call wrapper with automatic error handling
 */
async function processApiCall<T>(
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
 * API call with mapping function for easy data transformation
 */
export async function apiCall<T, R>(
  fn: () => Promise<ApiResponse<T> | undefined>,
  mapper: (data: T) => R,
  options?: Parameters<typeof processApiResponse>[1]
): Promise<R>;

/**
 * API call for void responses (no mapper needed)
 */
export async function apiCall<T>(
  fn: () => Promise<ApiResponse<T> | undefined>,
  options?: Parameters<typeof processApiResponse>[1]
): Promise<void>;

export async function apiCall<T, R>(
  fn: () => Promise<ApiResponse<T> | undefined>,
  mapperOrOptions?: ((data: T) => R) | Parameters<typeof processApiResponse>[1],
  options?: Parameters<typeof processApiResponse>[1]
): Promise<R | void> {
  const wrappedFn = async (): Promise<ApiResponse<T>> => {
    const response = await fn();

    if (!response) {
      throw new Error('No response data');
    }

    return response;
  };

  // If second parameter is a function, it's a mapper
  if (typeof mapperOrOptions === 'function') {
    const data = await processApiCall(wrappedFn, options);

    return mapperOrOptions(data);
  }

  // Otherwise, it's options (void response)
  await processApiCall(wrappedFn, mapperOrOptions);
}

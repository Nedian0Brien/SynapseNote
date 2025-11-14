import axios from 'axios';

import { ERROR_CODE } from '@/application/constants';

/**
 * Error types based on server HTTP status codes and selective error codes
 *
 * Server Error Response Format:
 * {
 *   code: number,    // ErrorCode enum (e.g., 1068, 1073, 1041)
 *   message: string
 * }
 *
 * HTTP Status Mapping (from server IntoResponse):
 * - 404: RecordNotFound
 * - 401: UserUnAuthorized, NotLoggedIn
 * - 403: NotEnoughPermissions
 * - 400: InvalidRequest, InvalidEmail, InvalidPassword
 * - 500: Internal, Unhandled
 * - 503: ServiceTemporaryUnavailable, AIServiceUnavailable
 * - 409: RecordAlreadyExists, UserAlreadyRegistered
 * - 429: TooManyRequests
 */
export enum ErrorType {
  /** 404 - Page/resource not found */
  PageNotFound = 'PAGE_NOT_FOUND',

  /** 401 - User not authenticated */
  Unauthorized = 'UNAUTHORIZED',

  /** 403 - User doesn't have permission */
  Forbidden = 'FORBIDDEN',

  /** 500, 502, 503, 504 - Server errors */
  ServerError = 'SERVER_ERROR',

  /** Network connection failed (no response from server) */
  NetworkError = 'NETWORK_ERROR',

  /** 400 with code 1068 - Invalid invitation/link */
  InvalidLink = 'INVALID_LINK',

  /** 409 with code 1073 - User already joined/exists */
  AlreadyJoined = 'ALREADY_JOINED',

  /** 403 with code 1041 - Not invitee of invitation */
  NotInvitee = 'NOT_INVITEE',

  /** 429 - Rate limited */
  RateLimited = 'RATE_LIMITED',

  /** 410 - Resource deleted */
  Gone = 'GONE',

  /** 408 - Request timeout */
  Timeout = 'TIMEOUT',

  /** Fallback for unhandled errors */
  Unknown = 'UNKNOWN',
}

/**
 * Structured error object with type, message, and optional code/status
 */
export interface AppError {
  /** Determined error type for UI handling */
  type: ErrorType;

  /** Human-readable error message from server */
  message: string;

  /** Server error code (e.g., 1068, 1073, 1041) */
  code?: number;

  /** HTTP status code (e.g., 404, 401, 403) */
  statusCode?: number;
}

/**
 * Determines error type from thrown error
 *
 * Strategy:
 * 1. Check if network error (no response)
 * 2. Check for specific error codes that need custom UX
 * 3. Fall back to HTTP status code mapping
 *
 * @param error - Error from API call or thrown exception
 * @returns Structured AppError object
 *
 * @example
 * ```typescript
 * try {
 *   await loadView(viewId);
 * } catch (error) {
 *   const appError = determineErrorType(error);
 *
 *   switch (appError.type) {
 *     case ErrorType.PageNotFound:
 *       return <PageNotFoundError />;
 *     case ErrorType.Unauthorized:
 *       return <UnauthorizedError />;
 *     case ErrorType.NetworkError:
 *       return <NetworkError onRetry={retry} />;
 *   }
 * }
 * ```
 */
export function determineErrorType(error: unknown): AppError {
  // Network error (no response from server)
  if (axios.isAxiosError(error) && !error.response) {
    return {
      type: ErrorType.NetworkError,
      message: error.message || 'Network connection failed. Please check your internet connection.',
    };
  }

  // HTTP error (server responded with error status)
  if (axios.isAxiosError(error) && error.response) {
    const status = error.response.status;
    const data = error.response.data as { code?: number; message?: string } | undefined;
    const code = data?.code;
    const message = data?.message || error.message;

    // Priority 1: Check for specific error codes that need custom handling
    // These codes require specific UX beyond generic status code handling
    if (code === ERROR_CODE.INVALID_LINK) {
      return {
        type: ErrorType.InvalidLink,
        message: message || 'Invalid or expired link',
        code,
        statusCode: status,
      };
    }

    if (code === ERROR_CODE.ALREADY_JOINED) {
      return {
        type: ErrorType.AlreadyJoined,
        message: message || 'You have already joined this workspace',
        code,
        statusCode: status,
      };
    }

    if (code === ERROR_CODE.NOT_INVITEE_OF_INVITATION) {
      return {
        type: ErrorType.NotInvitee,
        message: message || 'You are not the intended recipient of this invitation',
        code,
        statusCode: status,
      };
    }

    // Priority 2: Map HTTP status codes to error types
    switch (status) {
      case 404:
        return {
          type: ErrorType.PageNotFound,
          message: message || 'Page or resource not found',
          statusCode: status,
          code,
        };

      case 401:
        return {
          type: ErrorType.Unauthorized,
          message: message || 'You need to sign in to access this resource',
          statusCode: status,
          code,
        };

      case 403:
        return {
          type: ErrorType.Forbidden,
          message: message || 'You do not have permission to access this resource',
          statusCode: status,
          code,
        };

      case 408:
        return {
          type: ErrorType.Timeout,
          message: message || 'Request timed out. Please try again.',
          statusCode: status,
          code,
        };

      case 410:
        return {
          type: ErrorType.Gone,
          message: message || 'This resource has been deleted',
          statusCode: status,
          code,
        };

      case 429:
        return {
          type: ErrorType.RateLimited,
          message: message || 'Too many requests. Please try again later.',
          statusCode: status,
          code,
        };

      case 500:
      case 502:
      case 503:
      case 504:
        return {
          type: ErrorType.ServerError,
          message: message || 'Server error. Please try again later.',
          statusCode: status,
          code,
        };

      default:
        return {
          type: ErrorType.Unknown,
          message: message || 'An unexpected error occurred',
          statusCode: status,
          code,
        };
    }
  }

  // Non-axios error (e.g., thrown exception, logic error)
  const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

  return {
    type: ErrorType.Unknown,
    message: errorMessage,
  };
}

/**
 * Type guard to check if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    'message' in error &&
    Object.values(ErrorType).includes((error as AppError).type)
  );
}

/**
 * Formats error for logging/debugging
 */
export function formatErrorForLogging(error: unknown): string {
  const appError = determineErrorType(error);
  const parts = [
    `[${appError.type}]`,
    appError.message,
  ];

  if (appError.statusCode) {
    parts.push(`(HTTP ${appError.statusCode})`);
  }

  if (appError.code) {
    parts.push(`(Code ${appError.code})`);
  }

  return parts.join(' ');
}

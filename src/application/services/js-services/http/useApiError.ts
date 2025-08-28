import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppResponseError, ErrorCode, apiErrorHandler } from './error-handler';

/**
 * React hook for handling API errors in components
 */
export function useApiError() {
  const navigate = useNavigate();

  const handleError = useCallback(
    async (
      error: AppResponseError,
      options?: {
        showNotification?: boolean;
        customMessage?: string;
      }
    ) => {
      return apiErrorHandler.handleError(error, {
        ...options,
        onAuthError: () => {
          // Redirect to login on auth errors
          navigate('/login');
        },
        onPermissionError: () => {
          // Could show upgrade modal or permission denied page
          console.warn('Permission denied:', error.message);
        },
      });
    },
    [navigate]
  );

  const wrapApiCall = useCallback(
    async <T,>(
      apiCall: () => Promise<T>,
      options?: Parameters<typeof handleError>[1]
    ): Promise<T> => {
      try {
        return await apiCall();
      } catch (error: unknown) {
        if ((error as AppResponseError)?.code !== undefined) {
          await handleError(error as AppResponseError, options);
        }

        throw error;
      }
    },
    [handleError]
  );

  return {
    handleError,
    wrapApiCall,
  };
}

/**
 * Hook for handling specific error types
 */
export function useApiErrorHandler() {
  const navigate = useNavigate();

  const handleAuthError = useCallback(() => {
    navigate('/login');
  }, [navigate]);

  const handlePermissionError = useCallback(() => {
    // Show permission denied message or upgrade prompt
    console.warn('Permission denied');
  }, []);

  const handleResourceNotFound = useCallback(() => {
    navigate('/404');
  }, [navigate]);

  const handleLimitExceeded = useCallback(() => {
    // Show upgrade modal
    console.info('Limit exceeded - show upgrade prompt');
  }, []);

  const handleApiError = useCallback(
    (error: AppResponseError) => {
      switch (error.code) {
        case ErrorCode.UserUnAuthorized:
        case ErrorCode.NotLoggedIn:
          handleAuthError();
          break;
        case ErrorCode.NotEnoughPermissions:
        case ErrorCode.NotEnoughPermissionToWrite:
        case ErrorCode.NotEnoughPermissionToRead:
          handlePermissionError();
          break;
        case ErrorCode.RecordNotFound:
        case ErrorCode.MissingView:
          handleResourceNotFound();
          break;
        case ErrorCode.StorageSpaceNotEnough:
        case ErrorCode.WorkspaceLimitExceeded:
        case ErrorCode.PayloadTooLarge:
        case ErrorCode.UploadFileTooLarge:
          handleLimitExceeded();
          break;
        default:
          // Let the global error handler deal with it
          void apiErrorHandler.handleError(error);
      }
    },
    [handleAuthError, handlePermissionError, handleResourceNotFound, handleLimitExceeded]
  );

  return {
    handleApiError,
    handleAuthError,
    handlePermissionError,
    handleResourceNotFound,
    handleLimitExceeded,
  };
}
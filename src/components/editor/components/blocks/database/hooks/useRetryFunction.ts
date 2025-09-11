import { useCallback } from 'react';

const RETRY_CONFIG = {
  maxAttempts: 3,
  retryDelay: 10000,
};

// eslint-disable-next-line
export const useRetryFunction = <T extends any[], R>(
  fn: ((...args: T) => Promise<R>) | undefined,
  onError: () => void
) => {
  const retryFunction = useCallback(
    async (...args: T): Promise<R> => {
      let attempt = 1;
      
      const executeWithRetry = async (): Promise<R> => {
        try {
          if (!fn) {
            throw new Error('Function not available');
          }

          const result = await fn(...args);

          if (!result) {
            throw new Error('No result returned');
          }

          return result;
        } catch (error) {
          if (attempt < RETRY_CONFIG.maxAttempts) {
            attempt++;
            await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.retryDelay));
            return executeWithRetry();
          } else {
            onError();
            throw error;
          }
        }
      };

      return executeWithRetry();
    },
    [fn, onError]
  );

  return retryFunction;
};
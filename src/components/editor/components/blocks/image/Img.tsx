import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ReactComponent as ErrorOutline } from '@/assets/icons/error.svg';
import LoadingDots from '@/components/_shared/LoadingDots';
import { checkImage } from '@/utils/image';

function Img({
  onLoad,
  imgRef,
  url,
  width,
}: {
  url: string;
  imgRef?: React.RefObject<HTMLImageElement>;
  onLoad?: () => void;
  width: number | string;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [localUrl, setLocalUrl] = useState('');
  const [imgError, setImgError] = useState<{
    ok: boolean;
    status: number;
    statusText: string;
  } | null>(null);
  const previousBlobUrlRef = useRef<string>('');
  const isMountedRef = useRef(true);

  const handleCheckImage = useCallback(async (url: string) => {
    setLoading(true);

    // Configuration for polling
    const maxAttempts = 5; // Maximum number of polling attempts
    const pollingInterval = 6000; // Time between attempts in milliseconds (6 seconds)
    const timeoutDuration = 30000; // Maximum time to poll in milliseconds (30 seconds)

    let attempts = 0;
    const startTime = Date.now();

    const attemptCheck: () => Promise<boolean> = async () => {
      // Don't proceed if component is unmounted
      if (!isMountedRef.current) {
        return false;
      }

      try {
        const result = await checkImage(url);

        // Don't update state if component is unmounted
        if (!isMountedRef.current) {
          // Revoke blob URL if component unmounted during fetch
          if (result.ok && result.validatedUrl && result.validatedUrl.startsWith('blob:')) {
            URL.revokeObjectURL(result.validatedUrl);
          }

          return false;
        }

        // Success case
        if (result.ok) {
          /**
           * Revoke previous blob URL to prevent memory leaks.
           *
           * When checkImage handles AppFlowy file storage URLs, it creates blob URLs via
           * URL.createObjectURL(). These blob URLs must be explicitly revoked using
           * URL.revokeObjectURL() to free memory, otherwise they persist until page reload.
           *
           * We only revoke if:
           * - A previous blob URL exists
           * - It's different from the new one (to avoid revoking the URL we're about to use)
           * - It's actually a blob URL (not a regular HTTP URL)
           *
           * This prevents memory leaks when images change or during polling retries.
           */
          if (
            previousBlobUrlRef.current &&
            previousBlobUrlRef.current !== result.validatedUrl &&
            previousBlobUrlRef.current.startsWith('blob:')
          ) {
            URL.revokeObjectURL(previousBlobUrlRef.current);
          }

          setImgError(null);
          setLoading(false);
          const newUrl = result.validatedUrl || '';

          setLocalUrl(newUrl);
          previousBlobUrlRef.current = newUrl;
          setTimeout(() => {
            if (onLoad && isMountedRef.current) {
              onLoad();
            }
          }, 200);

          return true;
        }

        // Error case but continue polling if within limits
        setImgError(result);

        // Check if we've exceeded our timeout or max attempts
        attempts++;
        const elapsedTime = Date.now() - startTime;

        if (attempts >= maxAttempts || elapsedTime >= timeoutDuration) {
          setLoading(false); // Stop loading after max attempts or timeout
          setImgError({ ok: false, status: 404, statusText: 'Image Not Found' });
          return false;
        }

        await new Promise((resolve) => setTimeout(resolve, pollingInterval));
        return await attemptCheck();
        // eslint-disable-next-line
      } catch (e) {
        setImgError({ ok: false, status: 404, statusText: 'Image Not Found' });
        // Check if we should stop trying
        attempts++;
        const elapsedTime = Date.now() - startTime;

        if (attempts >= maxAttempts || elapsedTime >= timeoutDuration) {
          setLoading(false);
          return false;
        }

        // Continue polling after interval
        await new Promise((resolve) => setTimeout(resolve, pollingInterval));
        return await attemptCheck();
      }
    };

    void attemptCheck();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void handleCheckImage(url);

    // Cleanup: revoke blob URL when component unmounts or URL changes
    return () => {
      isMountedRef.current = false;
      if (previousBlobUrlRef.current && previousBlobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(previousBlobUrlRef.current);
        previousBlobUrlRef.current = '';
      }
    };
  }, [handleCheckImage, url]);

  return (
    <>
      <img
        ref={imgRef}
        src={localUrl}
        alt={''}
        onLoad={() => {
          setLoading(false);
          setImgError(null);
        }}
        draggable={false}
        style={{
          visibility: imgError ? 'hidden' : 'visible',
          width,
        }}
        className={'h-full bg-cover bg-center object-cover'}
      />
      {loading ? (
        <div className={'absolute inset-0 flex h-full w-full items-center justify-center bg-background-primary'}>
          <LoadingDots />
        </div>
      ) : imgError ? (
        <div
          className={
            'flex h-[48px] w-full items-center justify-center gap-2 rounded border border-function-error bg-red-50'
          }
        >
          <ErrorOutline className={'text-function-error'} />
          <div className={'text-function-error'}>{t('editor.imageLoadFailed')}</div>
        </div>
      ) : null}
    </>
  );
}

export default Img;

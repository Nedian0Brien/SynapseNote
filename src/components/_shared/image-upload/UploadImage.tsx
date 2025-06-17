import FileDropzone from '@/components/_shared/file-dropzone/FileDropzone';
import LoadingDots from '@/components/_shared/LoadingDots';
import { notify } from '@/components/_shared/notify';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];

export function UploadImage({
  onDone,
  uploadAction,
}: {
  onDone?: (url: string) => void;
  uploadAction?: (file: File) => Promise<string>;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = React.useState(false);
  const handleFileChange = useCallback(
    async (files: File[]) => {
      setLoading(true);
      const file = files[0];

      if (!file) return;

      try {
        const url = await uploadAction?.(file);

        if (!url) {
          onDone?.(URL.createObjectURL(file));
          return;
        }

        onDone?.(url);
        // eslint-disable-next-line
      } catch (e: any) {
        notify.error(e.message);
        onDone?.(URL.createObjectURL(file));
      } finally {
        setLoading(false);
      }
    },
    [onDone, uploadAction]
  );

  return (
    <div className={'h-full px-4 pb-4'}>
      <FileDropzone
        placeholder={t('fileDropzone.dropFile')}
        onChange={handleFileChange}
        accept={ALLOWED_IMAGE_EXTENSIONS.join(',')}
      />
      {loading && (
        <div
          className={
            'absolute inset-0 z-10 flex h-full w-full items-center justify-center bg-background-primary opacity-90'
          }
        >
          <LoadingDots />
        </div>
      )}
    </div>
  );
}

export default UploadImage;

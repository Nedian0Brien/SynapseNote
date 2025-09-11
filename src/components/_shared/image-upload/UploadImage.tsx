import React, { useCallback } from 'react';

import FileDropzone from '@/components/_shared/file-dropzone/FileDropzone';
import { notify } from '@/components/_shared/notify';

export const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];

export function UploadImage({
  onDone,
  uploadAction,
}: {
  onDone?: (url: string) => void;
  uploadAction?: (file: File) => Promise<string>;
}) {
  const [loading, setLoading] = React.useState(false);
  const handleFileChange = useCallback(
    async (files: File[]) => {
      setLoading(true);
      const file = files[0];

      if (!file) return;

      try {
        const url = await uploadAction?.(file);

        if (!url) {
          return;
        }

        onDone?.(url);
        // eslint-disable-next-line
      } catch (e: any) {
        notify.error(e.message);
      } finally {
        setLoading(false);
      }
    },
    [onDone, uploadAction]
  );

  return (
    <div className={'h-full'}>
      <FileDropzone onChange={handleFileChange} accept={ALLOWED_IMAGE_EXTENSIONS.join(',')} loading={loading} />
    </div>
  );
}

export default UploadImage;

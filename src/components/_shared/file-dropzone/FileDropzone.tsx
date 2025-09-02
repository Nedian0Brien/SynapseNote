import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface FileDropzoneProps {
  onChange?: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  placeholder?: string | React.ReactNode;
}

function FileDropzone({ onChange, accept, multiple, disabled, placeholder }: FileDropzoneProps) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList) => {
    const fileArray = Array.from(files);

    if (onChange) {
      if (!multiple && fileArray.length > 1) {
        onChange(fileArray.slice(0, 1));
      } else {
        onChange(fileArray);
      }
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);

    const toastError = () => toast.error(t('document.plugins.file.noImages'));

    if (!event.dataTransfer.files || event.dataTransfer.files.length === 0) {
      toastError();
      return;
    }

    const files = Array.from(event.dataTransfer.files);

    if (accept) {
      const isEveryFileValid = files.every((file: File) => {
        const acceptedTypes = accept.split(',');

        return acceptedTypes.some((type) => file.name.endsWith(type) || file.type === type);
      });

      if (!isEveryFileValid) {
        toastError();
        event.dataTransfer.clearData();
        return;
      }
    }

    handleFiles(event.dataTransfer.files);
    event.dataTransfer.clearData();
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      handleFiles(event.target.files);
      event.target.value = '';
    }
  };

  return (
    <div
      className='flex h-full min-h-[294px] w-full cursor-pointer flex-col justify-center rounded-[8px] bg-surface-primary px-4 outline-dashed outline-2 outline-border-primary hover:bg-surface-primary-hover'
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      style={{
        borderColor: dragging ? 'var(--border-theme-thick)' : undefined,
        backgroundColor: dragging ? 'var(--fill-info-light)' : undefined,
        pointerEvents: disabled ? 'none' : undefined,
        cursor: disabled ? 'not-allowed' : undefined,
      }}
    >
      <div className={'whitespace-pre-wrap break-words text-center text-sm text-text-primary'}>
        {placeholder || (
          <>
            <span>{t('document.plugins.file.fileUploadHint')}</span>
            <span className='text-text-action'>{t('document.plugins.file.fileUploadHintSuffix')}</span>
          </>
        )}
      </div>
      <input
        type='file'
        disabled={disabled}
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
      />
    </div>
  );
}

export default FileDropzone;

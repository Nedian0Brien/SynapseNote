import { CoverType, ViewMetaCover } from '@/application/types';
import { useAppHandlers, useAppViewId, useOpenModalViewId } from '@/components/app/app.hooks';
import React, { useMemo } from 'react';
import { EmbedLink, Unsplash, UploadPopover, TabOption, TAB_KEY, UploadImage } from '@/components/_shared/image-upload';
import { useTranslation } from 'react-i18next';
import Colors from './CoverColors';

function CoverPopover ({
  open,
  onOpenChange,
  onUpdateCover,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateCover?: (cover: ViewMetaCover) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const {
    uploadFile,
  } = useAppHandlers();
  const appViewId = useAppViewId();
  const modalViewId = useOpenModalViewId();
  const viewId = modalViewId || appViewId;

  const tabOptions: TabOption[] = useMemo(() => {
    return [
      {
        label: t('document.plugins.cover.colors'),
        key: TAB_KEY.Colors,
        Component: Colors,
        onDone: (value: string) => {
          onUpdateCover?.({
            type: CoverType.NormalColor,
            value,
          });
        },
      },
      {
        label: t('button.upload'),
        key: TAB_KEY.UPLOAD,
        Component: UploadImage,
        uploadAction: (file: File) => {
          if (!viewId || !uploadFile) return Promise.reject();
          return uploadFile(viewId, file);
        },
        onDone: (value: string) => {
          onUpdateCover?.({
            type: CoverType.CustomImage,
            value,
          });
          onOpenChange(false);
        },
      },
      {
        label: t('document.imageBlock.embedLink.label'),
        key: TAB_KEY.EMBED_LINK,
        Component: EmbedLink,
        onDone: (value: string) => {
          onUpdateCover?.({
            type: CoverType.CustomImage,
            value,
          });
          onOpenChange(false);
        },
      },
      {
        key: TAB_KEY.UNSPLASH,
        label: t('document.imageBlock.unsplash.label'),
        Component: Unsplash,
        onDone: (value: string) => {
          onUpdateCover?.({
            type: CoverType.UpsplashImage,
            value,
          });
        },
      },
    ];
  }, [onOpenChange, onUpdateCover, t, uploadFile, viewId]);

  return (
    <UploadPopover
      open={open}
      onOpenChange={onOpenChange}
      tabOptions={tabOptions}
    >{children}</UploadPopover>
  );
}

export default CoverPopover;

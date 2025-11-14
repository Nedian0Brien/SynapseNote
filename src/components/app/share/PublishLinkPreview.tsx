import { UpdatePublishConfigPayload } from '@/application/types';
import { ReactComponent as LinkIcon } from '@/assets/icons/link.svg';
import { ReactComponent as DownIcon } from '@/assets/icons/toggle_list.svg';
import { NormalModal } from '@/components/_shared/modal';
import { notify } from '@/components/_shared/notify';
import { PublishManage } from '@/components/app/publish-manage';
import { PublishNameSetting } from '@/components/app/publish-manage/PublishNameSetting';
import { copyTextToClipboard } from '@/utils/copy';
import { CircularProgress, IconButton, InputBase, Tooltip } from '@mui/material';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

function PublishLinkPreview({
  viewId,
  publishInfo,
  onUnPublish,
  updatePublishConfig,
  url,
  isOwner,
  isPublisher,
  onClose,
}: {
  viewId: string;
  publishInfo: { namespace: string; publishName: string };
  onUnPublish: () => Promise<void>;
  updatePublishConfig: (payload: UpdatePublishConfigPayload) => Promise<void>;
  url: string;
  isOwner: boolean;
  isPublisher: boolean;
  onClose?: () => void;
}) {
  const [siteOpen, setSiteOpen] = React.useState<boolean>(false);
  const [renameOpen, setRenameOpen] = React.useState<boolean>(false);
  const { t } = useTranslation();
  const [publishName, setPublishName] = React.useState<string>(publishInfo.publishName);
  const [loading, setLoading] = React.useState<boolean>(false);

  useEffect(() => {
    setPublishName(publishInfo.publishName);
  }, [publishInfo.publishName]);

  const handleUpdatePublishName = async (newName: string) => {
    if (loading) return;
    if (newName === publishInfo.publishName) return;
    setLoading(true);
    setPublishName(newName);
    try {
      await updatePublishConfig({
        publish_name: newName,
        view_id: viewId,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className={'flex w-full items-center overflow-hidden'}>
        <div className={'flex flex-1 items-center gap-1 overflow-hidden'}>
          <Tooltip placement={'top'} title={window.location.origin}>
            <div
              className={
                'flex-1 cursor-default truncate rounded-[6px] border border-border-primary bg-fill-content-hover px-2 py-1'
              }
              data-testid={'publish-origin'}
            >
              {window.location.origin}
            </div>
          </Tooltip>
          {'/'}
          <div className={'flex w-[110px] items-center gap-1 rounded-[6px] border border-border-primary px-2 py-1'}>
            <Tooltip placement={'top'} title={publishInfo.namespace}>
              <span className={'flex-1 truncate'} data-testid={'publish-namespace'}>{publishInfo.namespace}</span>
            </Tooltip>
            <Tooltip placement={'top'} title={t('settings.sites.namespaceDescription')}>
              <IconButton
                size={'small'}
                onClick={() => {
                  setSiteOpen(true);
                  onClose?.();
                }}
                data-testid={'open-publish-settings'}
              >
                <DownIcon className={'rotate-90 transform'} />
              </IconButton>
            </Tooltip>
          </div>
          {'/'}

          <div
            className={
              'flex w-[150px]  items-center gap-1 truncate rounded-[6px] border border-border-primary px-2 py-1'
            }
          >
            <Tooltip placement={'top'} title={publishName}>
              <InputBase
                disabled={!isOwner && !isPublisher}
                inputProps={{
                  className: 'pb-0',
                  'data-testid': 'publish-name-input',
                }}
                onBlur={() => {
                  void handleUpdatePublishName(publishName);
                }}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    void handleUpdatePublishName(publishName);
                  }
                }}
                size={'small'}
                value={publishName}
                onChange={(e) => {
                  setPublishName(e.target.value);
                }}
                className={'flex-1 truncate'}
              />
            </Tooltip>
            {(isOwner || isPublisher) && (
              <Tooltip placement={'top'} title={t('settings.sites.customUrl')}>
                <IconButton
                  size={'small'}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();

                    setRenameOpen(true);
                    onClose?.();
                  }}
                >
                  {loading ? <CircularProgress size={14} /> : <DownIcon className={'rotate-90 transform'} />}
                </IconButton>
              </Tooltip>
            )}
          </div>
        </div>
        <div className={'p-1 text-text-primary'}>
          <Tooltip placement={'top'} title={t('shareAction.copyLink')}>
            <IconButton
              onClick={async () => {
                await copyTextToClipboard(url);
                notify.success(t('shareAction.copyLinkSuccess'));
              }}
              color={'inherit'}
              size={'small'}
            >
              <LinkIcon />
            </IconButton>
          </Tooltip>
        </div>
        {renameOpen && (
          <PublishNameSetting
            defaultName={publishInfo.publishName}
            onClose={() => {
              setRenameOpen(false);
            }}
            open={renameOpen}
            onUnPublish={onUnPublish}
            updatePublishName={handleUpdatePublishName}
            url={url}
          />
        )}
        <NormalModal
          okButtonProps={{
            className: 'hidden',
          }}
          cancelButtonProps={{
            className: 'hidden',
          }}
          classes={{
            paper: 'w-[700px] appflowy-scroller max-w-[90vw] max-h-[90vh] h-[600px] overflow-hidden',
          }}
          overflowHidden
          onClose={() => {
            setSiteOpen(false);
          }}
          scroll={'paper'}
          open={siteOpen}
          title={<div className={'flex items-center justify-start'}>{t('settings.sites.title')}</div>}
        >
          <div className={'h-full w-full overflow-y-auto overflow-x-hidden'}>
            <PublishManage
              onClose={() => {
                setSiteOpen(false);
              }}
            />
          </div>
        </NormalModal>
      </div>
    </>
  );
}

export default PublishLinkPreview;

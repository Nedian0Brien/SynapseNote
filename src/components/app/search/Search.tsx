import { ReactComponent as DownIcon } from '@/assets/icons/alt_arrow_down.svg';
import { ReactComponent as SearchIcon } from '@/assets/icons/search.svg';
import { ReactComponent as CheckIcon } from '@/assets/icons/tick.svg';
import { useAppRecent } from '@/components/app/app.hooks';
import BestMatch from '@/components/app/search/BestMatch';
import RecentViews from '@/components/app/search/RecentViews';
import TitleMatch from '@/components/app/search/TitleMatch';
import { Popover } from '@/components/_shared/popover';
import { createHotkey, createHotKeyLabel, HOT_KEY_NAME } from '@/utils/hotkeys';
import { Button, Dialog, Divider, InputBase, Tooltip } from '@mui/material';
import React, { useCallback, useEffect } from 'react';

import { ReactComponent as CloseIcon } from '@/assets/icons/close.svg';
import { useTranslation } from 'react-i18next';

enum SEARCH_TYPE {
  AI_SUGGESTION = 'AI_SUGGESTION',
  TITLE_MATCH = 'TITLE_MATCH',
}

export function Search() {
  const [open, setOpen] = React.useState<boolean>(false);
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = React.useState<string>('');
  const [searchType, setSearchType] = React.useState<SEARCH_TYPE>(SEARCH_TYPE.AI_SUGGESTION);
  const [searchTypeAnchorEl, setSearchTypeAnchorEl] = React.useState<null | HTMLElement>(null);
  const handleClose = () => {
    setOpen(false);
    setSearchValue('');
  };

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    switch (true) {
      case createHotkey(HOT_KEY_NAME.SEARCH)(e):
        e.preventDefault();
        setOpen(true);
        break;
      default:
        break;
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onKeyDown]);

  const { recentViews, loadRecentViews } = useAppRecent();
  const [loadingRecentViews, setLoadingRecentViews] = React.useState<boolean>(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      setLoadingRecentViews(true);
      await loadRecentViews?.();
      setLoadingRecentViews(false);
    })();
  }, [loadRecentViews, open]);

  return (
    <>
      <Tooltip
        title={
          <div className={'flex flex-col gap-1'}>
            <span>{t('search.sidebarSearchIcon')}</span>
            <div className={'text-text-secondary'}>{createHotKeyLabel(HOT_KEY_NAME.SEARCH)}</div>
          </div>
        }
      >
        <Button
          onClick={(e) => {
            e.currentTarget.blur();
            setOpen(true);
          }}
          startIcon={<SearchIcon className={'mr-[1px] h-5 w-5 opacity-60'} />}
          size={'small'}
          className={'w-full justify-start py-1.5 text-sm font-normal hover:bg-fill-content-hover'}
          color={'inherit'}
        >
          {t('button.search')}
        </Button>
      </Tooltip>

      <Dialog
        disableRestoreFocus={true}
        open={open}
        onClose={handleClose}
        classes={{
          container: 'items-start max-md:mt-auto max-md:items-center mt-[10%]',
          paper: 'overflow-hidden min-w-[600px] w-[600px] max-w-[70vw]',
        }}
      >
        <div className={'flex w-full gap-2 border-b border-line-default p-4'}>
          <div className={'flex w-full items-center gap-4'}>
            <SearchIcon className={'mr-[1px] h-5 w-5 opacity-60'} />

            <InputBase
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              autoFocus={true}
              className={'flex-1'}
              fullWidth={true}
              placeholder={searchType === SEARCH_TYPE.AI_SUGGESTION ? t('AISearchPlaceholder') : t('searchLabel')}
            />
            <span
              style={{
                visibility: searchValue ? 'visible' : 'hidden',
              }}
              className={'cursor-pointer rounded-full bg-fill-content-hover p-0.5 opacity-60 hover:opacity-100'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                setSearchValue('');
              }}
            >
              <CloseIcon className={'h-3 w-3'} />
            </span>
            <Tooltip title={'we currently only support searching for pages and content in documents'}>
              <span className={'flex cursor-default items-center rounded bg-fill-content-hover p-1 px-2 text-xs'}>
                BETA
              </span>
            </Tooltip>
          </div>
        </div>
        <div className={'flex w-full items-center gap-2 p-4 py-2'}>
          <div
            onClick={(e) => {
              setSearchTypeAnchorEl(e.currentTarget);
            }}
            className={
              'flex cursor-pointer items-center gap-2 overflow-hidden rounded-[8px] border border-border-primary p-2 text-sm hover:border-text-primary'
            }
          >
            <span className={' max-w-[100px] truncate'}>
              {searchType === SEARCH_TYPE.TITLE_MATCH ? t('titleOnly') : t('AIsearch')}
            </span>
            <DownIcon className={'h-5 w-5'} />
          </div>
        </div>
        <Divider className={'border-line-default'} />
        {!searchValue ? (
          <RecentViews loading={loadingRecentViews} recentViews={recentViews} onClose={handleClose} />
        ) : searchType === SEARCH_TYPE.AI_SUGGESTION ? (
          <BestMatch searchValue={searchValue} onClose={handleClose} />
        ) : (
          <TitleMatch searchValue={searchValue} onClose={handleClose} />
        )}
      </Dialog>
      <Popover
        open={Boolean(searchTypeAnchorEl)}
        anchorEl={searchTypeAnchorEl}
        onClose={() => setSearchTypeAnchorEl(null)}
        slotProps={{
          paper: {
            className: 'p-2 w-fit my-2',
          },
        }}
      >
        {[SEARCH_TYPE.AI_SUGGESTION, SEARCH_TYPE.TITLE_MATCH].map((type) => (
          <div
            key={type}
            className={'flex cursor-pointer items-center gap-2 rounded-[8px] p-2 text-sm hover:bg-fill-content-hover'}
            onClick={() => {
              setSearchType(type);
              setSearchTypeAnchorEl(null);
            }}
          >
            {type === SEARCH_TYPE.TITLE_MATCH ? t('titleOnly') : t('AIsearch')}
            {type === searchType && <CheckIcon className={'h-5 w-5 text-function-info'} />}
          </div>
        ))}
      </Popover>
    </>
  );
}

export default Search;

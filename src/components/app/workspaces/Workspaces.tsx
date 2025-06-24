import { IconButton, Tooltip } from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { invalidToken } from '@/application/session/token';
import { Workspace } from '@/application/types';
import { ReactComponent as UpgradeAIMaxIcon } from '@/assets/icons/ai.svg';
import { ReactComponent as ChevronDownIcon } from '@/assets/icons/alt_arrow_down.svg';
import { ReactComponent as TipIcon } from '@/assets/icons/help.svg';
import { ReactComponent as AddUserIcon } from '@/assets/icons/invite_user.svg';
import { ReactComponent as LogoutIcon } from '@/assets/icons/logout.svg';
import { ReactComponent as AddIcon } from '@/assets/icons/plus.svg';
import { ReactComponent as ImportIcon } from '@/assets/icons/save_as.svg';
import { ReactComponent as UpgradeIcon } from '@/assets/icons/upgrade.svg';
import { useAppHandlers, useCurrentWorkspaceId, useUserWorkspaceInfo } from '@/components/app/app.hooks';
import CreateWorkspace from '@/components/app/workspaces/CreateWorkspace';
import CurrentWorkspace from '@/components/app/workspaces/CurrentWorkspace';
import DeleteWorkspace from '@/components/app/workspaces/DeleteWorkspace';
import InviteMember from '@/components/app/workspaces/InviteMember';
import LeaveWorkspace from '@/components/app/workspaces/LeaveWorkspace';
import WorkspaceList from '@/components/app/workspaces/WorkspaceList';
import UpgradeAIMax from '@/components/billing/UpgradeAIMax';
import UpgradePlan from '@/components/billing/UpgradePlan';
import { useCurrentUser, useService } from '@/components/main/app.hooks';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  dropdownMenuItemVariants,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Import from '@/components/_shared/more-actions/importer/Import';
import { notify } from '@/components/_shared/notify';
import { openUrl } from '@/utils/url';

export function Workspaces() {
  const { t } = useTranslation();
  const userWorkspaceInfo = useUserWorkspaceInfo();
  const currentWorkspaceId = useCurrentWorkspaceId();
  const currentUser = useCurrentUser();
  const [openUpgradePlan, setOpenUpgradePlan] = useState(false);
  const [openUpgradeAIMax, setOpenUpgradeAIMax] = useState(false);
  const [open, setOpen] = useState(false);
  const [hoveredHeader, setHoveredHeader] = useState<boolean>(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const [changeLoading, setChangeLoading] = useState<string | null>(null);
  const handleSignOut = useCallback(() => {
    invalidToken();
    navigate('/login?redirectTo=' + encodeURIComponent(window.location.href));
  }, [navigate]);

  const { onChangeWorkspace: handleSelectedWorkspace } = useAppHandlers();
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | undefined>(undefined);
  const [openInviteMember, setOpenInviteMember] = useState(false);
  const [openCreateWorkspace, setOpenCreateWorkspace] = useState(false);
  const [openRenameWorkspace, setOpenRenameWorkspace] = useState<Workspace | null>(null);
  const [openDeleteWorkspace, setOpenDeleteWorkspace] = useState<Workspace | null>(null);
  const [openLeaveWorkspace, setOpenLeaveWorkspace] = useState<Workspace | null>(null);

  const isOwner = currentWorkspace?.owner?.uid.toString() === currentUser?.uid.toString();

  useEffect(() => {
    setCurrentWorkspace(userWorkspaceInfo?.workspaces.find((workspace) => workspace.id === currentWorkspaceId));
  }, [currentWorkspaceId, userWorkspaceInfo]);

  const handleChange = useCallback(
    async (selectedId: string) => {
      setChangeLoading(selectedId);
      try {
        await handleSelectedWorkspace?.(selectedId);
        setOpen(false);
      } catch (e) {
        notify.error('Failed to change workspace');
      }

      setChangeLoading(null);
    },
    [handleSelectedWorkspace]
  );
  const [, setSearchParams] = useSearchParams();

  const handleOpenImport = useCallback(() => {
    setSearchParams((prev) => {
      prev.set('action', 'import');
      prev.set('source', 'notion');
      return prev;
    });
  }, [setSearchParams]);

  const service = useService();
  const handleCreateWorkspace = useCallback(
    async (name: string) => {
      if (!service) return;
      const workspaceId = await service.createWorkspace({
        workspace_name: name,
      });

      await handleSelectedWorkspace?.(workspaceId);
    },
    [handleSelectedWorkspace, service]
  );

  const handleUpdateWorkspace = useCallback(
    async (name: string) => {
      if (!service || !openRenameWorkspace) return;
      await service.updateWorkspace(openRenameWorkspace.id, {
        workspace_name: name,
      });
      if (openRenameWorkspace.id === currentWorkspaceId) {
        setCurrentWorkspace((prev) => {
          if (!prev) return prev;
          return { ...prev, name };
        });
      }

      setOpenRenameWorkspace(null);
    },
    [service, openRenameWorkspace, currentWorkspaceId]
  );

  return (
    <>
      <div className='mx-1 flex-1 overflow-hidden'>
        <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <div
              ref={ref}
              onMouseLeave={() => setHoveredHeader(false)}
              onMouseEnter={() => setHoveredHeader(true)}
              className={dropdownMenuItemVariants({ variant: 'default', className: 'w-full overflow-hidden' })}
            >
              <CurrentWorkspace
                userWorkspaceInfo={userWorkspaceInfo}
                selectedWorkspace={currentWorkspace}
                onChangeWorkspace={handleChange}
                avatarSize={24}
              />

              <div
                className='ml-auto transition-opacity duration-300'
                style={{
                  opacity: hoveredHeader ? 1 : 0,
                }}
              >
                <ChevronDownIcon className='h-5 w-5' />
              </div>
            </div>
          </DropdownMenuTrigger>

          <DropdownMenuContent className='min-w-[300px] max-w-[300px] overflow-hidden'>
            <DropdownMenuLabel className='w-full overflow-hidden'>
              <span className='truncate'>{currentUser?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuGroup className={'appflowy-scroller max-h-[200px] flex-1 overflow-y-auto overflow-x-hidden'}>
              <WorkspaceList
                defaultWorkspaces={userWorkspaceInfo?.workspaces}
                currentWorkspaceId={currentWorkspaceId}
                onChange={handleChange}
                changeLoading={changeLoading || undefined}
                onUpdate={setOpenRenameWorkspace}
                onDelete={setOpenDeleteWorkspace}
                onLeave={setOpenLeaveWorkspace}
              />
            </DropdownMenuGroup>
            <DropdownMenuItem
              onSelect={() => {
                setOpenCreateWorkspace(true);
              }}
            >
              <div
                className={
                  'flex h-[32px] w-[32px] items-center justify-center rounded-[8px] border border-border-primary'
                }
              >
                <AddIcon className={'h-5 w-5'} />
              </div>
              {t('workspace.create')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {currentWorkspace && (
                <DropdownMenuItem
                  onSelect={() => {
                    setOpenInviteMember(true);
                  }}
                >
                  <AddUserIcon />
                  {t('settings.appearance.members.inviteMembers')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={handleOpenImport}>
                <ImportIcon />
                <div className={'flex-1 text-left'}>{t('web.importNotion')}</div>
                <Tooltip title={t('workspace.learnMore')} enterDelay={1000} enterNextDelay={1000}>
                  <IconButton
                    onClick={(e) => {
                      e.stopPropagation();
                      void openUrl('https://docs.appflowy.io/docs/guides/import-from-notion', '_blank');
                    }}
                    size={'small'}
                    className={'mx-2'}
                  >
                    <TipIcon />
                  </IconButton>
                </Tooltip>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={handleSignOut}>
                <LogoutIcon />
                {t('button.logout')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {isOwner && (
              <DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    setOpenUpgradePlan(true);
                    setOpen(false);
                  }}
                >
                  <UpgradeIcon />
                  {t('subscribe.changePlan')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setOpenUpgradeAIMax(true);
                    setOpen(false);
                  }}
                >
                  <UpgradeAIMaxIcon />
                  {t('subscribe.getAIMax')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isOwner && (
        <>
          <UpgradePlan
            onOpen={() => {
              setOpenUpgradePlan(true);
            }}
            open={openUpgradePlan}
            onClose={() => setOpenUpgradePlan(false)}
          />
          <UpgradeAIMax
            onOpen={() => {
              setOpenUpgradeAIMax(true);
            }}
            open={openUpgradeAIMax}
            onClose={() => setOpenUpgradeAIMax(false)}
          />
        </>
      )}

      <Import />
      {openCreateWorkspace && (
        <CreateWorkspace
          onOk={handleCreateWorkspace}
          okText={t('workspace.create')}
          defaultName={`${currentUser?.name}'s Workspace`}
          open={openCreateWorkspace}
          openOnChange={setOpenCreateWorkspace}
        />
      )}

      {currentWorkspace && (
        <InviteMember open={openInviteMember} openOnChange={setOpenInviteMember} workspace={currentWorkspace} />
      )}

      {openRenameWorkspace && (
        <CreateWorkspace
          open={Boolean(openRenameWorkspace)}
          openOnChange={() => setOpenRenameWorkspace(null)}
          onOk={handleUpdateWorkspace}
          okText={t('workspace.rename')}
          defaultName={openRenameWorkspace.name}
          title={t('workspace.rename')}
        />
      )}

      {openDeleteWorkspace && (
        <DeleteWorkspace
          workspaceId={openDeleteWorkspace.id}
          name={openDeleteWorkspace.name}
          open={Boolean(openDeleteWorkspace)}
          openOnChange={() => setOpenDeleteWorkspace(null)}
        />
      )}

      {openLeaveWorkspace && (
        <LeaveWorkspace
          workspaceName={openLeaveWorkspace.name}
          workspaceId={openLeaveWorkspace.id}
          open={Boolean(openLeaveWorkspace)}
          openOnChange={() => setOpenLeaveWorkspace(null)}
        />
      )}
    </>
  );
}

export default Workspaces;

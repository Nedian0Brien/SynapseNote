import { Workspace } from '@/application/types';
import { ReactComponent as SelectedSvg } from '@/assets/icons/tick.svg';
import MoreActions from '@/components/app/workspaces/MoreActions';
import { getAvatarProps } from '@/components/app/workspaces/utils';
import { useService } from '@/components/main/app.hooks';
import { Avatar, Tooltip } from '@mui/material';
import CircularProgress from '@mui/material/CircularProgress';
import React, { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

function WorkspaceList({
  defaultWorkspaces,
  currentWorkspaceId,
  onChange,
  changeLoading,
  showActions = true,
  onUpdateCurrentWorkspace,
}: {
  currentWorkspaceId?: string;
  changeLoading?: string;
  onChange: (selectedId: string) => void;
  defaultWorkspaces?: Workspace[];
  showActions?: boolean;
  onUpdateCurrentWorkspace?: (name: string) => void;
}) {
  const service = useService();
  const { t } = useTranslation();
  const [hoveredWorkspaceId, setHoveredWorkspaceId] = React.useState<string | null>(null);
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>(defaultWorkspaces || []);
  const fetchWorkspaces = useCallback(async () => {
    if (!service) return;
    try {
      const workspaces = await service.getWorkspaces();

      setWorkspaces(workspaces);
    } catch (e) {
      console.error(e);
    }
  }, [service]);

  useEffect(() => {
    void fetchWorkspaces();
  }, [fetchWorkspaces]);

  const renderActions = useCallback(
    (workspace: Workspace) => {
      if (changeLoading === workspace.id) return <CircularProgress size={16} />;
      const hovered = hoveredWorkspaceId === workspace.id;

      if (workspace.id === currentWorkspaceId && !(hovered && showActions))
        return <SelectedSvg className={'h-5 w-5 text-fill-default'} />;

      if (showActions) {
        return (
          <div
            style={{
              visibility: hovered ? 'visible' : 'hidden',
            }}
          >
            <MoreActions
              workspace={workspace}
              onUpdated={(name: string) => {
                void fetchWorkspaces();
                if (workspace.id === currentWorkspaceId) {
                  onUpdateCurrentWorkspace?.(name);
                }
              }}
              onDeleted={() => {
                if (workspace.id === currentWorkspaceId) {
                  window.location.href = `/app`;
                } else {
                  void fetchWorkspaces();
                }
              }}
            />
          </div>
        );
      }

      return null;
    },
    [changeLoading, currentWorkspaceId, fetchWorkspaces, hoveredWorkspaceId, onUpdateCurrentWorkspace, showActions]
  );

  return (
    <>
      {workspaces.map((workspace) => {
        return (
          <div
            key={workspace.id}
            className={
              'relative flex cursor-pointer items-center justify-between gap-[10px] rounded-[8px] p-2 text-[1em] hover:bg-fill-content-hover'
            }
            onClick={async () => {
              if (workspace.id === currentWorkspaceId) return;
              void onChange(workspace.id);
            }}
            onMouseEnter={() => setHoveredWorkspaceId(workspace.id)}
            onMouseLeave={() => setHoveredWorkspaceId(null)}
          >
            <Avatar
              variant={'rounded'}
              className={'h-[2em] w-[2em] rounded-[8px] border border-border-primary text-[1.2em]'}
              {...getAvatarProps(workspace)}
            />
            <div className={'flex flex-1 flex-col items-start overflow-hidden'}>
              <Tooltip title={workspace.name} enterDelay={1000} enterNextDelay={1000}>
                <div className={'flex-1 truncate text-left font-medium text-text-primary'}>{workspace.name}</div>
              </Tooltip>
              <div className={'text-[0.85em] text-text-secondary'}>
                {t('invitation.membersCount', { count: workspace.memberCount || 0 })}
              </div>
            </div>
            {renderActions(workspace)}
          </div>
        );
      })}
    </>
  );
}

export default WorkspaceList;

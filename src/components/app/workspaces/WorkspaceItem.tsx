import { CircularProgress } from '@mui/material';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Workspace } from '@/application/types';
import MoreActions from '@/components/app/workspaces/MoreActions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenuItem, DropdownMenuItemTick } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function WorkspaceItem({
  workspace,
  showActions = true,
  onChange,
  currentWorkspaceId,
  changeLoading,
  onUpdate,
  onDelete,
  onLeave,
}: {
  showActions?: boolean;
  workspace: Workspace;
  onChange: (id: string) => void;
  currentWorkspaceId?: string;
  changeLoading?: string;
  onUpdate?: (workspace: Workspace) => void;
  onDelete?: (workspace: Workspace) => void;
  onLeave?: (workspace: Workspace) => void;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);

  const renderActions = useMemo(() => {
    if (changeLoading === workspace.id) return <CircularProgress size={16} />;

    if (!showActions) {
      if (currentWorkspaceId === workspace.id) {
        return <DropdownMenuItemTick />;
      }

      return null;
    }

    return (
      <div className='relative ml-auto flex h-7 w-7 items-center justify-center'>
        {currentWorkspaceId === workspace.id && (
          <DropdownMenuItemTick
            style={{
              opacity: hovered ? 0 : 1,
            }}
            className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
          />
        )}

        <div
          className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
          style={{
            opacity: hovered ? 1 : 0,
          }}
        >
          <MoreActions
            workspace={workspace}
            onUpdate={() => onUpdate?.(workspace)}
            onDelete={() => onDelete?.(workspace)}
            onLeave={() => onLeave?.(workspace)}
          />
        </div>
      </div>
    );
  }, [changeLoading, currentWorkspaceId, hovered, onDelete, onLeave, onUpdate, showActions, workspace]);

  return (
    <DropdownMenuItem
      key={workspace.id}
      className={'relative'}
      onSelect={async () => {
        if (workspace.id === currentWorkspaceId) return;
        void onChange(workspace.id);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Avatar shape={'square'} className='h-[32px] min-w-[32px]'>
        <AvatarImage src={workspace.icon} alt={''} />
        <AvatarFallback>{workspace.name}</AvatarFallback>
      </Avatar>
      <div className={'flex flex-1 flex-col items-start overflow-hidden'}>
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <div className={'w-full overflow-hidden truncate text-left text-sm text-text-primary'}>{workspace.name}</div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{workspace.name}</p>
          </TooltipContent>
        </Tooltip>
        <div className={'text-xs leading-[18px] text-text-secondary'}>
          {t('invitation.membersCount', { count: workspace.memberCount || 0 })}
        </div>
      </div>
      {renderActions}
    </DropdownMenuItem>
  );
}

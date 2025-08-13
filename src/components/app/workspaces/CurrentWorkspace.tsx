import { UserWorkspaceInfo, Workspace } from '@/application/types';
import { ReactComponent as AppFlowyLogo } from '@/assets/icons/appflowy.svg';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

function CurrentWorkspace({
  userWorkspaceInfo,
  selectedWorkspace,
  onChangeWorkspace,
}: {
  userWorkspaceInfo?: UserWorkspaceInfo;
  selectedWorkspace?: Workspace;
  onChangeWorkspace: (selectedId: string) => void;
  avatarSize?: number;
}) {
  if (!userWorkspaceInfo || !selectedWorkspace) {
    return (
      <div
        className={'flex  h-[48px] cursor-pointer items-center gap-1 p-1 text-text-primary'}
        onClick={async () => {
          const selectedId = userWorkspaceInfo?.selectedWorkspace?.id || userWorkspaceInfo?.workspaces[0]?.id;

          if (!selectedId) return;

          void onChangeWorkspace(selectedId);
        }}
      >
        <AppFlowyLogo className='!h-full !w-[118px]' />
      </div>
    );
  }

  return (
    <>
      <Avatar shape={'square'} size={'xs'}>
        <AvatarImage src={selectedWorkspace.icon} alt={''} />
        <AvatarFallback>
          {selectedWorkspace.icon ? <span className='text-xl'>{selectedWorkspace.icon}</span> : selectedWorkspace.name}
        </AvatarFallback>
      </Avatar>

      <div className={'flex-1 truncate font-medium text-text-primary'}>{selectedWorkspace.name}</div>
    </>
  );
}

export default CurrentWorkspace;

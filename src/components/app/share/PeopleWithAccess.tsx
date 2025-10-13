import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { AccessLevel, IPeopleWithAccessType, Role } from '@/application/types';
import { useCurrentWorkspaceId } from '@/components/app/app.hooks';
import { useCurrentUser, useService } from '@/components/main/app.hooks';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';

import { PersonItem } from './PersonItem';

interface PeopleWithAccessProps {
  viewId: string;
  people: IPeopleWithAccessType[];
  isLoading: boolean;
  onPeopleChange: () => Promise<void>;
}

export function PeopleWithAccess({ viewId, people, onPeopleChange, isLoading }: PeopleWithAccessProps) {
  const { t } = useTranslation();
  const currentUser = useCurrentUser();

  const service = useService();
  const currentWorkspaceId = useCurrentWorkspaceId();
  const navigate = useNavigate();
  const handleAccessLevelChange = useCallback(
    async (personEmail: string, newAccessLevel: AccessLevel) => {
      if (!service || !currentWorkspaceId) return;
      await service.sharePageTo(currentWorkspaceId, viewId, [personEmail], newAccessLevel);

      // Refresh the people list after change
      await onPeopleChange();
    },
    [onPeopleChange, currentWorkspaceId, service, viewId]
  );

  const handleRemoveAccess = useCallback(
    async (personEmail: string) => {
      if (!service || !currentWorkspaceId) return;
      await service.revokeAccess(currentWorkspaceId, viewId, [personEmail]);

      // Refresh the people list after removal
      await onPeopleChange();
      navigate('/app');
    },
    [onPeopleChange, currentWorkspaceId, service, viewId, navigate]
  );

  const handleTurnIntoMember = useCallback(
    async (personEmail: string) => {
      if (!service || !currentWorkspaceId) return;
      await service.turnIntoMember(currentWorkspaceId, personEmail);

      // Refresh the people list after change
      await onPeopleChange();
    },
    [onPeopleChange, currentWorkspaceId, service]
  );

  // Check if current user has full access (can modify others)
  const currentUserHasFullAccess =
    people.find((p) => p.email === currentUser?.email)?.access_level === AccessLevel.FullAccess;

  // Check if current user is owner
  const currentUserIsOwner = people.find((p) => p.email === currentUser?.email)?.role === Role.Owner;

  return (
    <div className='w-full px-2 pt-4'>
      <div className='flex items-center gap-2 px-2 py-1.5'>
        <Label>{t('shareAction.peopleWithAccess')}</Label>
        {isLoading && <Progress variant='primary' />}
      </div>
      <div className='flex max-h-[200px] w-full flex-col overflow-y-auto'>
        {people.map((person) => {
          const isYou = currentUser?.email === person.email;

          return (
            <PersonItem
              key={person.email}
              person={person}
              isYou={isYou}
              currentUserHasFullAccess={currentUserHasFullAccess}
              currentUserIsOwner={currentUserIsOwner}
              onAccessLevelChange={handleAccessLevelChange}
              onRemoveAccess={handleRemoveAccess}
              onTurnIntoMember={handleTurnIntoMember}
            />
          );
        })}
      </div>
    </div>
  );
}

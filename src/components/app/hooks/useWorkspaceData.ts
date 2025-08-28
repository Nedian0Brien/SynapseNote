import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sortBy, uniqBy } from 'lodash-es';
import { validate as uuidValidate } from 'uuid';

import { View, DatabaseRelations, UIVariant , ViewLayout, MentionablePerson } from '@/application/types';
import { findView, findViewByLayout } from '@/components/_shared/outline/utils';
import { createDeduplicatedNoArgsRequest } from '@/utils/deduplicateRequest';
import { useAuthInternal } from '../contexts/AuthInternalContext';

const USER_NO_ACCESS_CODE = [1024, 1012];

// Hook for managing workspace data (outline, favorites, recent, trash)
export function useWorkspaceData() {
  const { service, currentWorkspaceId, userWorkspaceInfo } = useAuthInternal();
  const navigate = useNavigate();
  
  const [outline, setOutline] = useState<View[]>();
  const stableOutlineRef = useRef<View[]>([]);
  const [favoriteViews, setFavoriteViews] = useState<View[]>();
  const [recentViews, setRecentViews] = useState<View[]>();
  const [trashList, setTrashList] = useState<View[]>();
  const [workspaceDatabases, setWorkspaceDatabases] = useState<DatabaseRelations | undefined>(undefined);
  const [requestAccessOpened, setRequestAccessOpened] = useState(false);
  
  const mentionableUsersRef = useRef<MentionablePerson[]>([]);

  // Load application outline
  const loadOutline = useCallback(
    async (workspaceId: string, force = true) => {
      if (!service) return;
      try {
        const res = await service?.getAppOutline(workspaceId);

        if (!res) {
          throw new Error('App outline not found');
        }

        stableOutlineRef.current = res;
        setOutline(res);


        if (!force) return;

        const firstView = findViewByLayout(res, [
          ViewLayout.Document,
          ViewLayout.Board,
          ViewLayout.Grid,
          ViewLayout.Calendar,
        ]);

        try {
          await service.openWorkspace(workspaceId);
          const wId = window.location.pathname.split('/')[2];
          const pageId = window.location.pathname.split('/')[3];
          const search = window.location.search;

          // Skip /app/trash and /app/*other-pages
          if (wId && !uuidValidate(wId)) {
            return;
          }

          // Skip /app/:workspaceId/:pageId
          if (pageId && uuidValidate(pageId) && wId && uuidValidate(wId) && wId === workspaceId) {
            return;
          }

          const lastViewId = localStorage.getItem('last_view_id');

          if (lastViewId && findView(res, lastViewId)) {
            navigate(`/app/${workspaceId}/${lastViewId}${search}`);
          } else if (firstView) {
            navigate(`/app/${workspaceId}/${firstView.view_id}${search}`);
          }
        } catch (e) {
          // Do nothing
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        console.error('App outline not found');
        if (USER_NO_ACCESS_CODE.includes(e.code)) {
          setRequestAccessOpened(true);
          return;
        }
      }
    },
    [navigate, service]
  );

  // Load favorite views
  const loadFavoriteViews = useCallback(async () => {
    if (!service || !currentWorkspaceId) return;
    try {
      const res = await service?.getAppFavorites(currentWorkspaceId);

      if (!res) {
        throw new Error('Favorite views not found');
      }

      setFavoriteViews(res);
      return res;
    } catch (e) {
      console.error('Favorite views not found');
    }
  }, [currentWorkspaceId, service]);

  // Load recent views
  const loadRecentViews = useCallback(async () => {
    if (!service || !currentWorkspaceId) return;
    try {
      const res = await service?.getAppRecent(currentWorkspaceId);

      if (!res) {
        throw new Error('Recent views not found');
      }

      const views = uniqBy(res, 'view_id') as unknown as View[];

      setRecentViews(
        views.filter((item: View) => {
          return !item.extra?.is_space && findView(outline || [], item.view_id);
        })
      );
      return views;
    } catch (e) {
      console.error('Recent views not found');
    }
  }, [currentWorkspaceId, service, outline]);

  // Load trash list
  const loadTrash = useCallback(
    async (currentWorkspaceId: string) => {
      if (!service) return;
      try {
        const res = await service?.getAppTrash(currentWorkspaceId);

        if (!res) {
          throw new Error('App trash not found');
        }

        setTrashList(sortBy(uniqBy(res, 'view_id') as unknown as View[], 'last_edited_time').reverse());
      } catch (e) {
        return Promise.reject('App trash not found');
      }
    },
    [service]
  );

  // Load database relations
  const loadDatabaseRelations = useCallback(async () => {
    if (!currentWorkspaceId || !service) {
      return;
    }

    const selectedWorkspace = userWorkspaceInfo?.selectedWorkspace;

    if (!selectedWorkspace) return;

    try {
      const res = await service?.getAppDatabaseViewRelations(currentWorkspaceId, selectedWorkspace.databaseStorageId);

      setWorkspaceDatabases(res);
      return res;
    } catch (e) {
      console.error(e);
    }
  }, [currentWorkspaceId, service, userWorkspaceInfo?.selectedWorkspace]);

  // Load views based on variant
  const loadViews = useCallback(
    async (variant?: UIVariant) => {
      if (!variant) {
        return outline || [];
      }

      if (variant === UIVariant.Favorite) {
        if (favoriteViews && favoriteViews.length > 0) {
          return favoriteViews || [];
        } else {
          return loadFavoriteViews();
        }
      }

      if (variant === UIVariant.Recent) {
        if (recentViews && recentViews.length > 0) {
          return recentViews || [];
        } else {
          return loadRecentViews();
        }
      }

      return [];
    },
    [favoriteViews, loadFavoriteViews, loadRecentViews, outline, recentViews]
  );

  // Load mentionable users
  const _loadMentionableUsers = useCallback(async () => {
    if (!currentWorkspaceId || !service) {
      throw new Error('No workspace or service found');
    }

    try {
      const res = await service?.getMentionableUsers(currentWorkspaceId);

      if (res) {
        mentionableUsersRef.current = res;
      }

      return res || [];
    } catch (e) {
      return Promise.reject(e);
    }
  }, [currentWorkspaceId, service]);

  const loadMentionableUsers = createDeduplicatedNoArgsRequest(_loadMentionableUsers);

  // Get mention user
  const getMentionUser = useCallback(
    async (uuid: string) => {
      if (mentionableUsersRef.current.length > 0) {
        const user = mentionableUsersRef.current.find((user) => user.person_id === uuid);

        if (user) {
          return user;
        }
      }

      try {
        const res = await loadMentionableUsers();

        return res.find((user: MentionablePerson) => user.person_id === uuid);
      } catch (e) {
        return Promise.reject(e);
      }
    },
    [loadMentionableUsers]
  );

  // Load data when workspace changes
  useEffect(() => {
    if (!currentWorkspaceId) return;
    void loadOutline(currentWorkspaceId);
    void (async () => {
      try {
        await loadTrash(currentWorkspaceId);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [loadOutline, currentWorkspaceId, loadTrash]);

  // Load database relations
  useEffect(() => {
    void loadDatabaseRelations();
  }, [loadDatabaseRelations]);

  return {
    outline,
    favoriteViews,
    recentViews,
    trashList,
    workspaceDatabases,
    requestAccessOpened,
    loadOutline,
    loadFavoriteViews,
    loadRecentViews,
    loadTrash,
    loadDatabaseRelations,
    loadViews,
    getMentionUser,
    loadMentionableUsers,
    stableOutlineRef,
  };
}
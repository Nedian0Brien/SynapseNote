export const databasePrefix = 'af_database';

export const HEADER_HEIGHT = 48;

export const ERROR_CODE = {
  INVALID_LINK: 1068,
  ALREADY_JOINED: 1073,
  NOT_INVITEE_OF_INVITATION: 1041,
  NOT_HAS_PERMISSION: 1012
};

export const APP_EVENTS = {
  OUTLINE_LOADED: 'outline-loaded',
  RECONNECT_WEBSOCKET: 'reconnect-websocket',
  WEBSOCKET_STATUS: 'websocket-status',
  // Workspace notification events
  WORKSPACE_NOTIFICATION: 'workspace-notification',
  USER_PROFILE_CHANGED: 'user-profile-changed',
  PERMISSION_CHANGED: 'permission-changed',
  SECTION_CHANGED: 'section-changed',
  SHARE_VIEWS_CHANGED: 'share-views-changed',
  MENTIONABLE_PERSON_LIST_CHANGED: 'mentionable-person-list-changed',
  SERVER_LIMIT_CHANGED: 'server-limit-changed',
};
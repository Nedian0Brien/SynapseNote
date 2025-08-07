import { BaseRange } from 'slate';

export interface AwarenessSelection {
  start: {
    path: number[];
    offset: number;
  };
  end: {
    path: number[];
    offset: number;
  };
}

export interface AwarenessUser {
  uid: number;
  name: string;
  timestamp: number;
  device_id: string;
  color: string;
}

export interface AwarenessMetadata {
  user_name: string;
  cursor_color: string;
  selection_color: string;
  user_avatar: string;
}

export interface AwarenessState {
  version: number;
  timestamp: number;
  user?: {
    uid: number;
    device_id: string;
  };
  metadata?: string;
  selection?: AwarenessSelection | null;
}

export interface Cursor {
  uid: number;
  deviceId: string;
  name: string;
  cursorColor: string;
  selectionColor: string;
  selection: AwarenessSelection;
  baseRange?: BaseRange;
  timestamp: number;
}

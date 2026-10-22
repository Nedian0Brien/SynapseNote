import type { Dispatch, SetStateAction } from 'react';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

export interface CommandPaletteProps {
  bridge?: OkDesktopBridge | null;
  open: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
  onOpenDataInspector?: () => void;
  onOpenAgentRuns?: () => void;
  onOpenDatabases?: () => void;
  onOpenDatabaseDiagnostics?: () => void;
}

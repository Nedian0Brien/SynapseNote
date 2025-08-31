import { ChatRequest } from '../request/chat-request';
import { User } from './request';
import { PromptDatabaseConfiguration } from '../provider/prompt-modal-provider';
import { RawPromptData, PromptDatabaseField } from './prompt';

export * from './request';
export * from './writer';

export interface ChatProps {
  workspaceId: string;
  chatId: string;
  requestInstance: ChatRequest;
  currentUser?: User;
  openingViewId?: string;
  onOpenView?: (viewId: string) => void;
  onCloseView?: () => void;
  selectionMode?: boolean;
  onOpenSelectionMode?: () => void;
  onCloseSelectionMode?: () => void;
  loadDatabasePrompts?: (config: PromptDatabaseConfiguration) => Promise<{
    rawDatabasePrompts: RawPromptData[];
    fields: PromptDatabaseField[];
  }>;
  testDatabasePromptConfig?: (databaseViewId: string) => Promise<{
    config: PromptDatabaseConfiguration;
    fields: PromptDatabaseField[];
  }>;
}

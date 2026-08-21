import { useState } from 'react';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import type { TerminalLaunchIntent } from '../EditorPane';
import { TerminalGate } from '../TerminalGate';
import { CliChatPanel } from './CliChatPanel';
import type {
  CliChatDocumentContext,
  CliChatId,
  CliChatImageAttachment,
  CliChatSelectionContext,
} from './cli-chat-types';

export interface CliChatHeaderSession {
  readonly id: string;
  readonly cli: CliChatId;
  readonly title: string;
  readonly openSessionId?: string;
  readonly resumeSessionId?: string;
}

interface CliChatSessionProps {
  readonly bridge: OkDesktopBridge;
  readonly cli: CliChatId;
  readonly launch: TerminalLaunchIntent;
  readonly adoptPtyId?: string | null;
  readonly onPtyId?: (ptyId: string | null) => void;
  readonly onTitleChange?: (title: string) => void;
  readonly onClose?: () => void;
  readonly documentContext?: CliChatDocumentContext | null;
  readonly selectionContext?: CliChatSelectionContext | null;
  readonly imageAttachments?: readonly CliChatImageAttachment[];
  readonly onImageAttachmentsChange?: (next: readonly CliChatImageAttachment[]) => void;
  readonly onNativeSessionId?: (sessionId: string) => void;
  readonly providerOptions?: readonly CliChatId[];
  readonly onProviderChange?: (provider: CliChatId) => void;
}

export function CliChatSession({
  bridge,
  cli,
  launch,
  adoptPtyId = null,
  onPtyId,
  onTitleChange,
  onClose,
  documentContext = null,
  selectionContext = null,
  imageAttachments = [],
  onImageAttachmentsChange,
  onNativeSessionId,
  providerOptions = [],
  onProviderChange,
}: CliChatSessionProps) {
  const [ptyId, setPtyId] = useState<string | null>(null);

  function reportPtyId(next: string | null) {
    setPtyId(next);
    onPtyId?.(next);
  }

  // No header of its own. The session's name is its tab in the strip above, and
  // "previous chats" / "new chat" are verbs on the whole chat surface, not on
  // one session — they live in that strip's trailing controls. This row used to
  // repeat the tab's title verbatim and carry a second `+`, so the rail opened
  // with three stacked header bands before a single message.
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <CliChatPanel
            bridge={bridge}
            cli={cli}
            ptyId={ptyId}
            initialPrompt={launch.prompt}
            initialDisplayPrompt={launch.displayPrompt}
            context={launch.context}
            documentContext={documentContext}
            selectionContext={selectionContext}
            imageAttachments={imageAttachments}
            onImageAttachmentsChange={onImageAttachmentsChange}
            initialSessionId={launch.resumeSessionId}
            providerOptions={providerOptions}
            onProviderChange={onProviderChange}
            onSessionId={(sessionId) => {
              if (ptyId !== null) bridge.terminal.setMeta(ptyId, { chatSessionId: sessionId });
              onNativeSessionId?.(sessionId);
            }}
            onTitleChange={onTitleChange}
          />
        </div>
        <div className="invisible pointer-events-none absolute inset-0" inert>
          <TerminalGate
            key={cli}
            bridge={bridge}
            launch={null}
            privateHistory
            adoptPtyId={adoptPtyId}
            onPtyId={reportPtyId}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}

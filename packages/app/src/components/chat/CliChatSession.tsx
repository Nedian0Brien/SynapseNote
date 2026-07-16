import { useLingui } from '@lingui/react/macro';
import { MessageSquareIcon, SquareTerminalIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { cn } from '@/lib/utils';
import type { TerminalLaunchIntent } from '../EditorPane';
import { TerminalGate } from '../TerminalGate';
import { CliChatPanel } from './CliChatPanel';
import type { CliChatId, CliChatSelectionContext } from './cli-chat-types';

interface CliChatSessionProps {
  readonly bridge: OkDesktopBridge;
  readonly cli: CliChatId;
  readonly launch: TerminalLaunchIntent;
  readonly adoptPtyId?: string | null;
  readonly onPtyId?: (ptyId: string | null) => void;
  readonly onTitleChange?: (title: string) => void;
  readonly onClose?: () => void;
  readonly selectionContext?: CliChatSelectionContext | null;
}

export function CliChatSession({
  bridge,
  cli,
  launch,
  adoptPtyId = null,
  onPtyId,
  onTitleChange,
  onClose,
  selectionContext = null,
}: CliChatSessionProps) {
  const { t } = useLingui();
  const [surface, setSurface] = useState<'chat' | 'terminal'>('chat');
  const [ptyId, setPtyId] = useState<string | null>(null);

  function reportPtyId(next: string | null) {
    setPtyId(next);
    onPtyId?.(next);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1">
        <Button
          type="button"
          size="xs"
          variant={surface === 'chat' ? 'secondary' : 'ghost'}
          aria-pressed={surface === 'chat'}
          onClick={() => setSurface('chat')}
        >
          <MessageSquareIcon />
          {t`Chat`}
        </Button>
        <Button
          type="button"
          size="xs"
          variant={surface === 'terminal' ? 'secondary' : 'ghost'}
          aria-pressed={surface === 'terminal'}
          onClick={() => setSurface('terminal')}
        >
          <SquareTerminalIcon />
          {t`Terminal`}
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          className={cn('absolute inset-0', surface !== 'chat' && 'invisible pointer-events-none')}
        >
          <CliChatPanel
            bridge={bridge}
            cli={cli}
            ptyId={ptyId}
            initialPrompt={launch.prompt}
            initialDisplayPrompt={launch.displayPrompt}
            context={launch.context}
            selectionContext={selectionContext}
            initialSessionId={launch.resumeSessionId}
            onSessionId={(sessionId) => {
              if (ptyId !== null) bridge.terminal.setMeta(ptyId, { chatSessionId: sessionId });
            }}
          />
        </div>
        <div
          className={cn(
            'absolute inset-0',
            surface !== 'terminal' && 'invisible pointer-events-none',
          )}
        >
          <TerminalGate
            bridge={bridge}
            launch={null}
            privateHistory
            adoptPtyId={adoptPtyId}
            onPtyId={reportPtyId}
            onTitleChange={onTitleChange}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}

import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { MessageActions } from '@/components/agent-chat-framework/message-actions';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

export function ChatMessageActions({
  text,
  bridge,
  onRegenerate,
  disabled,
}: {
  text: string;
  bridge: OkDesktopBridge;
  onRegenerate?: () => void;
  disabled: boolean;
}) {
  const { t } = useLingui();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    setCopyFailed(false);
    try {
      await bridge.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  return (
    <div>
      <MessageActions
        copied={copied}
        copyLabel={copied ? t`Copied` : t`Copy message`}
        regenerateLabel={
          disabled ? t`Wait for the current response to finish` : t`Regenerate response`
        }
        onCopy={() => void copy()}
        onRegenerate={onRegenerate}
        disabled={disabled}
      />
      {copyFailed ? (
        <p
          role="alert"
          className="text-xs text-destructive"
        >{t`Could not copy the message. Try again.`}</p>
      ) : null}
    </div>
  );
}

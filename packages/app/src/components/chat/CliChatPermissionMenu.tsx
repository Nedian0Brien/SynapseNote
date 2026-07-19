import { useLingui } from '@lingui/react/macro';
import { ShieldAlertIcon, ShieldCheckIcon, ShieldIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { type CliChatPermissionMode, isCliChatPermissionMode } from './cli-chat-types';

interface CliChatPermissionMenuProps {
  readonly value: CliChatPermissionMode;
  readonly onValueChange: (value: CliChatPermissionMode) => void;
  readonly disabled?: boolean;
  readonly onClose?: () => void;
}

export function CliChatPermissionMenu({
  value,
  onValueChange,
  disabled = false,
  onClose,
}: CliChatPermissionMenuProps) {
  const { t } = useLingui();
  const label =
    value === 'read-only'
      ? t`Read only`
      : value === 'workspace-write'
        ? t`Workspace access`
        : t`Full access`;
  const Icon =
    value === 'read-only'
      ? ShieldIcon
      : value === 'workspace-write'
        ? ShieldCheckIcon
        : ShieldAlertIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          disabled={disabled}
          aria-label={t`Permissions: ${label}`}
          title={t`Permissions: ${label}`}
        >
          <Icon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onClose?.();
        }}
      >
        <DropdownMenuLabel>{t`Agent permissions`}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            if (isCliChatPermissionMode(next)) onValueChange(next);
          }}
        >
          <DropdownMenuRadioItem value="read-only" className="items-start py-2">
            <ShieldIcon aria-hidden="true" className="mt-0.5" />
            <span className="flex flex-col">
              <span>{t`Read only`}</span>
              <span className="text-xs text-muted-foreground">{t`Inspect without editing files`}</span>
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="workspace-write" className="items-start py-2">
            <ShieldCheckIcon aria-hidden="true" className="mt-0.5" />
            <span className="flex flex-col">
              <span>{t`Workspace access`}</span>
              <span className="text-xs text-muted-foreground">{t`Read and edit this project`}</span>
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="full-access" className="items-start py-2 text-destructive">
            <ShieldAlertIcon aria-hidden="true" className="mt-0.5" />
            <span className="flex flex-col">
              <span>{t`Full access`}</span>
              <span className="text-xs text-muted-foreground">{t`Disable sandbox and approvals`}</span>
            </span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { resolvePageCover, resolvePageIcon } from '@/components/page-header-utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export interface DatabasePageAppearance {
  icon: string | null;
  cover: string | null;
}

export function DatabasePageAppearanceDialog({
  open,
  onOpenChange,
  icon,
  cover,
  busy = false,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon?: string;
  cover?: string;
  busy?: boolean;
  onSave: (appearance: DatabasePageAppearance) => void;
}) {
  const { t } = useLingui();
  const [iconDraft, setIconDraft] = useState(icon ?? '');
  const [coverDraft, setCoverDraft] = useState(cover ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setIconDraft(icon ?? '');
    setCoverDraft(cover ?? '');
    setError(null);
  }, [open, icon, cover]);

  const save = () => {
    const nextIcon = iconDraft.trim();
    const nextCover = coverDraft.trim();
    if (nextIcon && resolvePageIcon(nextIcon).kind === 'unsupported') {
      setError(t`Use an emoji or an image URL/path for the database icon.`);
      return;
    }
    if (nextCover && resolvePageCover(nextCover).kind === 'unsupported') {
      setError(t`Use an image URL/path ending in a supported image extension for the cover.`);
      return;
    }
    setError(null);
    onSave({ icon: nextIcon || null, cover: nextCover || null });
  };

  const previewIcon = resolvePageIcon(iconDraft);
  const previewCover = resolvePageCover(coverDraft);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <Trans>Customize database page</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Choose the page icon and cover shown above the database table.</Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <label htmlFor="database-page-icon-input" className="grid gap-1.5 text-sm">
            <span className="font-medium">
              <Trans>Page icon</Trans>
            </span>
            <Input
              id="database-page-icon-input"
              value={iconDraft}
              placeholder={t`🗂️ or assets/database-icon.png`}
              aria-label={t`Database page icon`}
              onChange={(event) => setIconDraft(event.currentTarget.value)}
            />
            <span className="text-muted-foreground text-xs">
              <Trans>
                Use an emoji or a workspace image path. Leave blank for the default icon.
              </Trans>
            </span>
          </label>
          <label htmlFor="database-page-cover-input" className="grid gap-1.5 text-sm">
            <span className="font-medium">
              <Trans>Cover image</Trans>
            </span>
            <Input
              id="database-page-cover-input"
              value={coverDraft}
              placeholder={t`https://example.com/cover.png or assets/cover.png`}
              aria-label={t`Database page cover`}
              onChange={(event) => setCoverDraft(event.currentTarget.value)}
            />
            <span className="text-muted-foreground text-xs">
              <Trans>
                Use a safe image URL or workspace path. Leave blank to remove the cover.
              </Trans>
            </span>
          </label>
          {previewIcon.kind !== 'unsupported' || previewCover.kind !== 'unsupported' ? (
            <div
              className="rounded-md border bg-muted/30 p-3 text-sm"
              data-testid="database-page-appearance-preview"
            >
              <div className="font-medium">
                <Trans>Preview</Trans>
              </div>
              <div className="mt-2 flex items-center gap-2">
                {previewIcon.kind === 'emoji' ? (
                  <span className="text-xl" aria-hidden="true">
                    {previewIcon.value}
                  </span>
                ) : previewIcon.kind === 'url' || previewIcon.kind === 'path' ? (
                  <img
                    src={previewIcon.value}
                    alt=""
                    className="size-6 rounded object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : null}
                <span className="truncate">{coverDraft || t`Database page`}</span>
              </div>
              {previewCover.kind !== 'unsupported' ? (
                <img
                  src={previewCover.value}
                  alt=""
                  className="mt-2 h-20 w-full rounded object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <Trans>Cancel</Trans>
          </Button>
          <Button type="button" disabled={busy} onClick={save}>
            <Trans>Save appearance</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

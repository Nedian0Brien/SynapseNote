import { Trans } from '@lingui/react';
import type { DatabaseProperty } from '@nedian0brien/synapsenote-core';
import { useState } from 'react';
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
import { Label } from '@/components/ui/label';

export function DatabaseUniqueIdPropertyDialog({
  open,
  onOpenChange,
  property,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Extract<DatabaseProperty, { type: 'unique_id' }>;
  onSave: (prefix: string) => void;
}) {
  const [prefix, setPrefix] = useState(property.prefix);
  const normalized = prefix.trim();
  const valid = normalized === '' || /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(normalized);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <Trans id="Configure Unique ID" />
          </DialogTitle>
          <DialogDescription>
            <Trans id="Changing the prefix updates display and export only. Existing record numbers stay stable and are never reused." />
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="database-unique-id-prefix">
              <Trans id="Prefix" />
            </Label>
            <Input
              id="database-unique-id-prefix"
              value={prefix}
              maxLength={32}
              placeholder="TASK"
              aria-invalid={!valid}
              onChange={(event) => setPrefix(event.target.value)}
            />
            {!valid ? (
              <p className="text-destructive text-xs" role="alert">
                <Trans id="Use only letters, numbers, underscores, or hyphens." />
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                <Trans
                  id="Unique ID preview"
                  message="Preview: {value}"
                  values={{ value: `${normalized ? `${normalized}-` : ''}${property.nextNumber}` }}
                />
              </p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <Trans id="Cancel" />
          </Button>
          <Button
            disabled={!valid || normalized === property.prefix}
            onClick={() => onSave(normalized)}
          >
            <Trans id="Save" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

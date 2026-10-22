import { Trans } from '@lingui/react';
import type { DatabaseProperty } from '@nedian0brien/synapsenote-core';
import { MapPin, Search, Shield } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function DatabasePlacePropertyDialog({
  open,
  onOpenChange,
  property,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Extract<DatabaseProperty, { type: 'place' }>;
  onSave: (policy: {
    externalSearch: 'disabled' | 'explicit';
    externalMap: 'disabled' | 'explicit';
  }) => void;
}) {
  const [externalSearch, setExternalSearch] = useState(property.externalSearch === 'explicit');
  const [externalMap, setExternalMap] = useState(property.externalMap === 'explicit');
  const changed =
    externalSearch !== (property.externalSearch === 'explicit') ||
    externalMap !== (property.externalMap === 'explicit');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <Trans id="Configure Place privacy" />
          </DialogTitle>
          <DialogDescription>
            <Trans id="Manual Place editing and coordinate previews remain local and work offline. External features are disabled by default." />
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <label
            htmlFor={`database-place-search-policy-${property.id}`}
            className="flex items-start gap-3 rounded-md border p-3"
          >
            <Checkbox
              id={`database-place-search-policy-${property.id}`}
              checked={externalSearch}
              onCheckedChange={(checked) => setExternalSearch(checked === true)}
              aria-label="Enable explicit external address search"
            />
            <span className="grid gap-1 text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <Search className="size-4" aria-hidden="true" />
                <Trans id="External address search" />
              </span>
              <span className="text-muted-foreground text-xs">
                <Trans id="Shows a consent checkbox before each submitted query. No keystroke autocomplete is sent." />
              </span>
            </span>
          </label>
          <label
            htmlFor={`database-place-map-policy-${property.id}`}
            className="flex items-start gap-3 rounded-md border p-3"
          >
            <Checkbox
              id={`database-place-map-policy-${property.id}`}
              checked={externalMap}
              onCheckedChange={(checked) => setExternalMap(checked === true)}
              aria-label="Enable explicit external map links"
            />
            <span className="grid gap-1 text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <MapPin className="size-4" aria-hidden="true" />
                <Trans id="External map links" />
              </span>
              <span className="text-muted-foreground text-xs">
                <Trans id="Adds an explicit link that sends the stored coordinates to OpenStreetMap only when clicked. No map tiles load automatically." />
              </span>
            </span>
          </label>
          <p className="flex items-start gap-1.5 text-muted-foreground text-xs">
            <Shield className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <Trans id="Approximate coordinates are rounded before storage, so later searches, exports, and map links cannot recover the exact location." />
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <Trans id="Cancel" />
          </Button>
          <Button
            disabled={!changed}
            onClick={() =>
              onSave({
                externalSearch: externalSearch ? 'explicit' : 'disabled',
                externalMap: externalMap ? 'explicit' : 'disabled',
              })
            }
          >
            <Trans id="Save" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

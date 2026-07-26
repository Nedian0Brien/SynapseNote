import { Trans } from '@lingui/react/macro';
import type { DatabasePropertyType } from '@nedian0brien/synapsenote-core';
import { LoaderCircle, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DatabasePropertyTypeIcon } from './database-property-icons';

const PEEK_PROPERTY_TYPES: readonly { type: DatabasePropertyType; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'number', label: 'Number' },
  { type: 'select', label: 'Select' },
  { type: 'multi_select', label: 'Multi-select' },
  { type: 'date', label: 'Date' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'url', label: 'URL' },
  { type: 'email', label: 'Email' },
  { type: 'phone', label: 'Phone' },
  { type: 'files', label: 'Files' },
  { type: 'place', label: 'Place' },
];

export function DatabaseRecordPeekPropertyPopover({
  onCreate,
}: {
  onCreate: (input: { name: string; type: DatabasePropertyType }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<DatabasePropertyType>('text');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    const trimmedName = name.trim();
    if (!trimmedName || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({ name: trimmedName, type });
      setName('');
      setType('text');
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add property');
    }
    setBusy(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setError(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 -ml-1 justify-start px-1.5 font-normal text-muted-foreground"
          aria-label="Add a property"
        >
          <Plus /> <Trans>Add a property</Trans>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-80 p-3">
        <div className="grid gap-3">
          <div>
            <h3 className="font-medium text-sm">
              <Trans>Add a property</Trans>
            </h3>
            <p className="mt-1 text-muted-foreground text-xs">
              <Trans>Choose a name and type for the new property.</Trans>
            </p>
          </div>
          <Input
            autoFocus
            value={name}
            aria-label="New property name"
            placeholder="Property name"
            disabled={busy}
            onChange={(event) => setName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <fieldset className="grid grid-cols-2 gap-1">
            <legend className="sr-only">Property type</legend>
            {PEEK_PROPERTY_TYPES.map((candidate) => (
              <Button
                key={candidate.type}
                type="button"
                size="sm"
                variant={type === candidate.type ? 'secondary' : 'ghost'}
                aria-pressed={type === candidate.type}
                className="justify-start gap-2"
                disabled={busy}
                onClick={() => setType(candidate.type)}
              >
                <DatabasePropertyTypeIcon type={candidate.type} className="size-4" />
                {candidate.label}
              </Button>
            ))}
          </fieldset>
          {error ? (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="button" disabled={!name.trim() || busy} onClick={() => void submit()}>
            {busy ? <LoaderCircle className="animate-spin" /> : null}
            <Trans>Add property</Trans>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

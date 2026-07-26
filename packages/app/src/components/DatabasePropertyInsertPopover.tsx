import { Trans } from '@lingui/react/macro';
import type { DatabaseProperty, DatabasePropertyType } from '@nedian0brien/synapsenote-core';
import { Plus } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DatabasePropertyTypeIcon } from './database-property-icons';

const NOTION_PROPERTY_TYPES: readonly { type: DatabasePropertyType; label: string }[] = [
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

export function nextDatabasePropertyName(
  type: DatabasePropertyType,
  properties: readonly Pick<DatabaseProperty, 'name'>[],
): string {
  const label = NOTION_PROPERTY_TYPES.find((candidate) => candidate.type === type)?.label ?? type;
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const numberedName = new RegExp(`^${escapedLabel} (\\d+)$`, 'i');
  const highestNumber = properties.reduce((highest, property) => {
    const match = property.name.trim().match(numberedName);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `${label} ${highestNumber + 1}`;
}

export function DatabasePropertyInsertPopover({
  open,
  setOpen,
  mutationLocked,
  propertyInsertTarget,
  setPropertyInsertTarget,
  newPropertyName,
  setNewPropertyName,
  newPropertyType,
  setNewPropertyType,
  properties = [],
  submitAddProperty,
  showLabel = false,
}: {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  mutationLocked: boolean;
  propertyInsertTarget: { propertyId: string; position: 'before' | 'after' } | null;
  setPropertyInsertTarget: Dispatch<
    SetStateAction<{ propertyId: string; position: 'before' | 'after' } | null>
  >;
  newPropertyName: string;
  setNewPropertyName: Dispatch<SetStateAction<string>>;
  newPropertyType: DatabasePropertyType;
  setNewPropertyType: Dispatch<SetStateAction<DatabasePropertyType>>;
  properties?: readonly Pick<DatabaseProperty, 'name'>[];
  submitAddProperty: () => void;
  showLabel?: boolean;
}) {
  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setNewPropertyName(nextDatabasePropertyName(newPropertyType, properties));
        }
        setOpen(nextOpen);
        if (!nextOpen) setPropertyInsertTarget(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={showLabel ? 'sm' : 'icon-xs'}
          className={
            showLabel
              ? 'h-full w-full justify-start rounded-none px-3 font-normal text-muted-foreground hover:bg-muted/35 hover:text-foreground'
              : 'ml-1'
          }
          aria-label="Add property"
          disabled={mutationLocked}
        >
          <Plus aria-hidden="true" />
          {showLabel ? <Trans>Add property</Trans> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="grid gap-3">
          <div>
            <h3 className="font-medium text-sm">
              {propertyInsertTarget ? (
                propertyInsertTarget.position === 'before' ? (
                  <Trans>Insert property to the left</Trans>
                ) : (
                  <Trans>Insert property to the right</Trans>
                )
              ) : (
                <Trans>Add property</Trans>
              )}
            </h3>
            <p className="mt-1 text-muted-foreground text-xs">
              <Trans>Choose a name and type for the new column.</Trans>
            </p>
          </div>
          <Input
            value={newPropertyName}
            aria-label="New property name"
            placeholder="Property name"
            onChange={(event) => setNewPropertyName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitAddProperty();
            }}
          />
          <fieldset className="grid grid-cols-2 gap-1.5">
            <legend className="sr-only">Property type</legend>
            {NOTION_PROPERTY_TYPES.map((candidate) => (
              <Button
                key={candidate.type}
                type="button"
                size="sm"
                variant={newPropertyType === candidate.type ? 'secondary' : 'ghost'}
                aria-pressed={newPropertyType === candidate.type}
                className="justify-start gap-2"
                onClick={() => {
                  const currentAutomaticName = nextDatabasePropertyName(
                    newPropertyType,
                    properties,
                  );
                  setNewPropertyType(candidate.type);
                  if (
                    !newPropertyName.trim() ||
                    newPropertyName === 'New property' ||
                    newPropertyName === currentAutomaticName
                  ) {
                    setNewPropertyName(nextDatabasePropertyName(candidate.type, properties));
                  }
                }}
              >
                <DatabasePropertyTypeIcon type={candidate.type} className="size-4" />
                {candidate.label}
              </Button>
            ))}
          </fieldset>
          <Button
            type="button"
            disabled={!newPropertyName.trim() || mutationLocked}
            onClick={submitAddProperty}
          >
            {propertyInsertTarget ? <Trans>Insert property</Trans> : <Trans>Add property</Trans>}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

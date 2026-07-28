import { Trans } from '@lingui/react/macro';
import type { DatabasePropertyType } from '@nedian0brien/synapsenote-core';
import { Plus } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DATABASE_ADDABLE_PROPERTY_GROUPS } from '@/lib/database-mutations/database-property-commands';
import { databasePropertyTypeLabel } from '@/lib/database-property-copy';
import { DatabasePropertyTypeIcon } from './database-property-icons';

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
  submitAddProperty: () => void;
  showLabel?: boolean;
}) {
  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
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
          <fieldset className="max-h-72 overflow-y-auto">
            <legend className="sr-only">Property type</legend>
            {DATABASE_ADDABLE_PROPERTY_GROUPS.map((group) => (
              <div key={group.id} className="mb-1 last:mb-0">
                <p className="px-2 py-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                  {group.label}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.types.map((type) => (
                    <Button
                      key={type}
                      type="button"
                      size="sm"
                      variant={newPropertyType === type ? 'secondary' : 'ghost'}
                      aria-pressed={newPropertyType === type}
                      className="justify-start gap-2"
                      onClick={() => setNewPropertyType(type)}
                    >
                      <DatabasePropertyTypeIcon type={type} className="size-4" />
                      {databasePropertyTypeLabel(type)}
                    </Button>
                  ))}
                </div>
              </div>
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

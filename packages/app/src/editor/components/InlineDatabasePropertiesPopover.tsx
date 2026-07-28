import type {
  DatabaseProperty,
  DatabasePropertyType,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import { ArrowDown, ArrowUp, Plus, Settings2 } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { DatabasePropertyTypeIcon } from '@/components/database-property-icons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DATABASE_ADDABLE_PROPERTY_TYPES } from '@/lib/database-mutations/database-property-commands';
import {
  databasePropertyTypeExample,
  databasePropertyTypeLabel,
} from '@/lib/database-property-copy';

interface InlineDatabasePropertiesPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  source: DatabaseSource;
  visiblePropertyIds: readonly string[];
  onVisiblePropertyIdsChange: (propertyIds: readonly string[]) => void;
  onAddProperty: (input: { name: string; type: DatabasePropertyType }) => void;
  onOpenAdvanced: (propertyId?: string) => void;
}

/**
 * The document-native property surface. View projection changes are applied
 * immediately to the linked block; schema operations continue through the
 * existing typed mutation policy and can be handed to the advanced dialog.
 */
export function InlineDatabasePropertiesPopover({
  open,
  onOpenChange,
  trigger,
  source,
  visiblePropertyIds,
  onVisiblePropertyIdsChange,
  onAddProperty,
  onOpenAdvanced,
}: InlineDatabasePropertiesPopoverProps) {
  const [orderedIds, setOrderedIds] = useState<string[]>(() => [...visiblePropertyIds]);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<DatabasePropertyType>('text');

  useEffect(() => {
    if (open) setOrderedIds([...visiblePropertyIds]);
  }, [open, visiblePropertyIds]);

  const propertiesById = new Map(
    source.properties.map((property) => [property.id, property] as const),
  );
  const visibleProperties = orderedIds
    .map((propertyId) => propertiesById.get(propertyId))
    .filter((property): property is DatabaseProperty => property !== undefined);

  const commitProjection = (nextIds: readonly string[]) => {
    const normalized = [...new Set(nextIds)];
    setOrderedIds(normalized);
    onVisiblePropertyIdsChange(normalized);
  };

  const toggleProperty = (property: DatabaseProperty, checked: boolean) => {
    if (property.type === 'title') return;
    if (checked) {
      commitProjection([...orderedIds, property.id]);
      return;
    }
    commitProjection(orderedIds.filter((propertyId) => propertyId !== property.id));
  };

  const moveProperty = (propertyId: string, direction: -1 | 1) => {
    const index = orderedIds.indexOf(propertyId);
    const target = index + direction;
    if (index < 1 || target < 1 || target >= orderedIds.length) return;
    const next = [...orderedIds];
    [next[index], next[target]] = [next[target] as string, next[index] as string];
    commitProjection(next);
  };

  const addProperty = () => {
    const name = newName.trim();
    if (!name) return;
    onAddProperty({ name, type: newType });
    setNewName('');
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] space-y-3 p-3"
        data-testid="inline-database-properties"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-medium text-sm">Properties</h2>
            <p className="text-muted-foreground text-xs">Choose columns for this linked view.</p>
          </div>
          <Settings2 className="size-4 text-muted-foreground" aria-hidden="true" />
        </div>

        <ul className="max-h-56 space-y-1 overflow-y-auto" aria-label="Visible properties">
          {source.properties.map((property) => {
            const index = orderedIds.indexOf(property.id);
            const visible = index >= 0;
            const title = property.type === 'title';
            return (
              <li
                key={property.id}
                className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted/60"
                data-inline-property-id={property.id}
              >
                <Checkbox
                  checked={visible}
                  disabled={title}
                  aria-label={`Show ${property.name}`}
                  onCheckedChange={(checked) => toggleProperty(property, checked === true)}
                />
                <span className="min-w-0 flex-1 truncate">{property.name}</span>
                <span className="text-muted-foreground text-xs">
                  {databasePropertyTypeLabel(property.type)}
                </span>
                {visible ? (
                  <>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${property.name} up`}
                      disabled={title || index <= 1}
                      onClick={() => moveProperty(property.id, -1)}
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${property.name} down`}
                      disabled={title || index === visibleProperties.length - 1}
                      onClick={() => moveProperty(property.id, 1)}
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="space-y-2 rounded-md border border-dashed p-2">
          <p className="font-medium text-xs">Add property</p>
          <Input
            value={newName}
            placeholder="Property name"
            aria-label="New property name"
            onChange={(event) => setNewName(event.currentTarget.value)}
          />
          <div className="flex items-center gap-2">
            <Select
              value={newType}
              onValueChange={(value) => setNewType(value as DatabasePropertyType)}
            >
              <SelectTrigger aria-label="New property type" className="min-w-0 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATABASE_ADDABLE_PROPERTY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    <DatabasePropertyTypeIcon type={type} className="size-4" />
                    {databasePropertyTypeLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" disabled={!newName.trim()} onClick={addProperty}>
              <Plus aria-hidden="true" /> Add
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">{databasePropertyTypeExample(newType)}</p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => onOpenAdvanced()}
        >
          Open advanced property management
        </Button>
      </PopoverContent>
    </Popover>
  );
}

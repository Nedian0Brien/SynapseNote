import { Trans } from '@lingui/react/macro';
import type {
  DatabaseProperty,
  DatabasePropertyType,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import { Check, ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Types that construct with no additional required configuration (no
 * relation target, formula source, or verifier setup). Matches the target
 * set `DatabasePropertyConversionDialog` offers for the same reason.
 */
const ADDABLE_PROPERTY_TYPES = [
  'text',
  'number',
  'checkbox',
  'date',
  'select',
  'multi_select',
  'url',
  'email',
  'phone',
  'files',
  'place',
] as const satisfies readonly DatabasePropertyType[];

/**
 * Add, remove, and reorder schema properties for one database source. Every
 * action here builds a `DatabaseDesiredStateDraftInput` and hands off to the
 * caller's `runMutation`-style pipeline, which closes this dialog and shows
 * the exact-plan ghost review in the underlying table before it commits —
 * this dialog never commits directly.
 */
export function DatabasePropertiesDialog({
  open,
  onOpenChange,
  source,
  mutationLocked,
  error,
  initialRenamePropertyId,
  onAddProperty,
  onRemoveProperty,
  onReorderProperties,
  onRenameProperty,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: DatabaseSource;
  mutationLocked: boolean;
  error: string | null;
  initialRenamePropertyId?: string | null;
  onAddProperty: (input: { name: string; type: DatabasePropertyType }) => void;
  onRemoveProperty: (property: DatabaseProperty) => void;
  onReorderProperties: (orderedPropertyIds: string[]) => void;
  onRenameProperty?: (property: DatabaseProperty, name: string) => void;
}) {
  'use no memo';
  const [order, setOrder] = useState<string[]>(() =>
    source.properties.map((property) => property.id),
  );
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<DatabasePropertyType>('text');
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  useEffect(() => {
    setOrder(source.properties.map((property) => property.id));
  }, [source.properties]);

  useEffect(() => {
    const property = source.properties.find(
      (candidate) => candidate.id === initialRenamePropertyId,
    );
    if (!property || !onRenameProperty) {
      setEditingPropertyId(null);
      setRenameDraft('');
      return;
    }
    setEditingPropertyId(property.id);
    setRenameDraft(property.name);
  }, [initialRenamePropertyId, onRenameProperty, source.properties]);

  const byId = new Map(source.properties.map((property) => [property.id, property] as const));
  const orderedProperties = order
    .map((id) => byId.get(id))
    .filter((property): property is DatabaseProperty => property !== undefined);
  const dirty = order.some((id, index) => id !== source.properties[index]?.id);

  const move = (propertyId: string, direction: -1 | 1) => {
    setOrder((current) => {
      const index = current.indexOf(propertyId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const property = byId.get(propertyId);
      const neighbor = byId.get(current[target] ?? '');
      if (property?.type === 'title' || neighbor?.type === 'title') return current;
      const next = [...current];
      [next[index], next[target]] = [next[target] as string, next[index] as string];
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Manage properties</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Add, remove, and reorder this database's schema properties. Every change compiles into
              a reviewed, undoable plan before it commits.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <ul className="space-y-1" aria-label="Database properties">
            {orderedProperties.map((property, index) => {
              const title = property.type === 'title';
              const editing = editingPropertyId === property.id;
              return (
                <li
                  key={property.id}
                  data-database-property-row={property.id}
                  className="flex items-center gap-2 rounded border bg-background p-2 text-sm"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {editing ? (
                      <Input
                        aria-label={`Rename ${property.name}`}
                        value={renameDraft}
                        disabled={mutationLocked}
                        onChange={(event) => setRenameDraft(event.currentTarget.value)}
                        className="h-8 min-w-32 flex-1"
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && renameDraft.trim()) {
                            event.preventDefault();
                            onRenameProperty?.(property, renameDraft.trim());
                            setEditingPropertyId(null);
                            setRenameDraft('');
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setEditingPropertyId(null);
                            setRenameDraft('');
                          }
                        }}
                      />
                    ) : (
                      <span className="truncate font-medium">{property.name}</span>
                    )}
                    <Badge variant="outline">{property.type}</Badge>
                    {title ? <Badge variant="gray">Frozen</Badge> : null}
                  </div>
                  {editing ? (
                    <>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Save rename for ${property.name}`}
                        disabled={mutationLocked || !renameDraft.trim()}
                        onClick={() => {
                          onRenameProperty?.(property, renameDraft.trim());
                          setEditingPropertyId(null);
                          setRenameDraft('');
                        }}
                      >
                        <Check aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Cancel rename for ${property.name}`}
                        disabled={mutationLocked}
                        onClick={() => {
                          setEditingPropertyId(null);
                          setRenameDraft('');
                        }}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Rename ${property.name}`}
                      disabled={mutationLocked || title || !onRenameProperty}
                      onClick={() => {
                        setEditingPropertyId(property.id);
                        setRenameDraft(property.name);
                      }}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Move ${property.name} up`}
                    disabled={mutationLocked || title || index <= 1}
                    onClick={() => move(property.id, -1)}
                  >
                    <ChevronUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Move ${property.name} down`}
                    disabled={mutationLocked || title || index === orderedProperties.length - 1}
                    onClick={() => move(property.id, 1)}
                  >
                    <ChevronDown aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${property.name}`}
                    disabled={mutationLocked || title}
                    onClick={() => onRemoveProperty(property)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={mutationLocked || !dirty}
              onClick={() => onReorderProperties(order)}
            >
              <Trans>Save order</Trans>
            </Button>
          </div>

          <div className="grid gap-2 rounded-md border border-dashed p-3">
            <Label htmlFor="database-new-property-name">
              <Trans>Add property</Trans>
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="database-new-property-name"
                value={newName}
                placeholder="Property name"
                disabled={mutationLocked}
                onChange={(event) => setNewName(event.currentTarget.value)}
                className="min-w-40 flex-1"
              />
              <Select
                value={newType}
                onValueChange={(value) => setNewType(value as DatabasePropertyType)}
              >
                <SelectTrigger
                  aria-label="New property type"
                  className="w-40"
                  disabled={mutationLocked}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADDABLE_PROPERTY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                disabled={mutationLocked || newName.trim() === ''}
                onClick={() => {
                  onAddProperty({ name: newName.trim(), type: newType });
                  setNewName('');
                }}
              >
                <Plus aria-hidden="true" />
                <Trans>Add</Trans>
              </Button>
            </div>
          </div>

          {error ? (
            <p
              className="rounded-md border border-destructive/40 p-3 text-destructive text-sm"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <Trans>Close</Trans>
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

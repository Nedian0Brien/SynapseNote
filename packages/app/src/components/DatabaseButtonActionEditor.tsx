import { Trans } from '@lingui/react/macro';
import type {
  DatabaseButtonAction,
  DatabaseButtonMutationOperation,
  DatabaseDefinition,
  DatabaseProperty,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export type DatabaseButtonLiteralValue = Extract<
  DatabaseButtonAction,
  { kind: 'create_record' }
>['values'][string];

/**
 * The value types this editor renders an input for.
 *
 * `person`, `files`, `place`, and `relation` accept literals the manifest can
 * describe but no keyboard can reasonably produce here — a person ID, a
 * declared file object, a geocoded place, a record ID. They are left out of the
 * pickers rather than given a text box that only ever produces invalid input;
 * an action already carrying one is preserved untouched.
 */
type EditableValueProperty = Extract<
  DatabaseProperty,
  {
    type:
      | 'title'
      | 'text'
      | 'url'
      | 'email'
      | 'phone'
      | 'number'
      | 'checkbox'
      | 'date'
      | 'select'
      | 'status'
      | 'multi_select';
  }
>;

export function isEditableValueProperty(
  property: DatabaseProperty,
): property is EditableValueProperty {
  switch (property.type) {
    case 'title':
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
    case 'number':
    case 'checkbox':
    case 'date':
    case 'select':
    case 'status':
    case 'multi_select':
      return true;
    default:
      return false;
  }
}

/** Sentinel for `append` with no `propertyId`, which targets the record body. */
const RECORD_BODY_TARGET = 'body';

const BOOLEAN_TRUE = 'true';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A starting literal that is valid for the property wherever one exists. */
export function defaultButtonValue(property: EditableValueProperty): DatabaseButtonLiteralValue {
  switch (property.type) {
    case 'number':
      return 0;
    case 'checkbox':
      return false;
    case 'date':
      return todayIsoDate();
    case 'multi_select':
      return [];
    case 'select':
    case 'status':
      return property.options.find((option) => option.archived !== true)?.id ?? '';
    default:
      return '';
  }
}

function ButtonValueInput({
  property,
  value,
  onChange,
  label,
}: {
  property: EditableValueProperty;
  value: DatabaseButtonLiteralValue | undefined;
  onChange: (value: DatabaseButtonLiteralValue) => void;
  label: string;
}) {
  if (property.type === 'checkbox') {
    return (
      <Select
        value={value === true ? BOOLEAN_TRUE : 'false'}
        onValueChange={(next) => onChange(next === BOOLEAN_TRUE)}
      >
        <SelectTrigger aria-label={label} className="h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={BOOLEAN_TRUE}>Checked</SelectItem>
          <SelectItem value="false">Unchecked</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  if (property.type === 'select' || property.type === 'status') {
    const options = property.options.filter((option) => option.archived !== true);
    if (options.length === 0) {
      return (
        <p className="text-muted-foreground text-xs">
          <Trans>This property has no selectable option.</Trans>
        </p>
      );
    }
    return (
      <Select value={typeof value === 'string' ? value : ''} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (property.type === 'multi_select') {
    // The literal union also covers arrays of file objects, so narrow to the
    // option IDs a multi-select actually holds rather than trusting the array.
    const selected = Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const options = property.options.filter((option) => option.archived !== true);
    return (
      <fieldset className="flex flex-wrap gap-1" aria-label={label}>
        {options.map((option) => {
          const active = selected.includes(option.id);
          return (
            <Button
              key={option.id}
              type="button"
              size="xs"
              variant={active ? 'secondary' : 'outline'}
              aria-pressed={active}
              onClick={() =>
                onChange(
                  active
                    ? selected.filter((optionId) => optionId !== option.id)
                    : [...selected, option.id],
                )
              }
            >
              {option.name}
            </Button>
          );
        })}
      </fieldset>
    );
  }
  if (property.type === 'number') {
    return (
      <Input
        type="number"
        aria-label={label}
        className="h-8"
        value={typeof value === 'number' ? String(value) : ''}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    );
  }
  return (
    <Input
      type={property.type === 'date' ? 'date' : 'text'}
      aria-label={label}
      className="h-8"
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

const OPERATION_LABELS: Readonly<Record<DatabaseButtonMutationOperation['op'], string>> = {
  set: 'Set a value',
  unset: 'Clear a value',
  increment: 'Add to a number',
  append: 'Append text',
  add: 'Add an option',
  remove: 'Remove an option',
  link: 'Link a record',
  unlink: 'Unlink a record',
};

/**
 * Operations the pickers offer. `link`/`unlink` name a record by ID, which
 * needs the relation record picker rather than this schema-shaped form, so they
 * are preserved when present but never created here.
 */
const OFFERED_OPERATIONS: readonly DatabaseButtonMutationOperation['op'][] = [
  'set',
  'unset',
  'increment',
  'append',
  'add',
  'remove',
];

function operationTargets(
  source: DatabaseSource,
  op: DatabaseButtonMutationOperation['op'],
): readonly DatabaseProperty[] {
  return source.properties.filter((property) => {
    switch (op) {
      case 'set':
        return isEditableValueProperty(property);
      case 'unset':
        return isEditableValueProperty(property) && !property.required;
      case 'increment':
        return property.type === 'number';
      case 'append':
        return property.type === 'title' || property.type === 'text';
      case 'add':
      case 'remove':
        return property.type === 'multi_select';
      default:
        return false;
    }
  });
}

function freshOperation(
  source: DatabaseSource,
  op: DatabaseButtonMutationOperation['op'],
): DatabaseButtonMutationOperation | null {
  // Appending to the record body needs no property at all, which makes it the
  // one operation that is legal in every source.
  if (op === 'append') return { op, value: '' };
  const target = operationTargets(source, op)[0];
  if (!target) return null;
  if (op === 'increment') return { op, propertyId: target.id, by: 1 };
  if (op === 'unset') return { op, propertyId: target.id };
  if (op === 'add' || op === 'remove') {
    const option =
      target.type === 'multi_select'
        ? target.options.find((candidate) => candidate.archived !== true)
        : undefined;
    if (!option) return null;
    return { op, propertyId: target.id, value: option.id };
  }
  if (!isEditableValueProperty(target)) return null;
  return { op: 'set', propertyId: target.id, value: defaultButtonValue(target) };
}

/** The first operation of a new `update_record` action: legal in any source. */
export function seedButtonOperation(source: DatabaseSource): DatabaseButtonMutationOperation {
  return freshOperation(source, 'append') ?? { op: 'append', value: '' };
}

function OperationRow({
  source,
  operation,
  onChange,
  onRemove,
  removable,
  index,
}: {
  source: DatabaseSource;
  operation: DatabaseButtonMutationOperation;
  onChange: (operation: DatabaseButtonMutationOperation) => void;
  onRemove: () => void;
  removable: boolean;
  index: number;
}) {
  const offered = OFFERED_OPERATIONS.includes(operation.op);
  const targets = operationTargets(source, operation.op);
  const targetId = 'propertyId' in operation ? operation.propertyId : undefined;
  const target = source.properties.find((property) => property.id === targetId);
  const position = index + 1;
  if (!offered) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-dashed p-2">
        <code className="min-w-0 flex-1 break-all text-xs">{JSON.stringify(operation)}</code>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove operation ${position}`}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border p-2">
      <div className="grid gap-1">
        <Label className="text-[11px] text-muted-foreground">
          <Trans>Operation</Trans>
        </Label>
        <Select
          value={operation.op}
          onValueChange={(next) => {
            const replacement = freshOperation(
              source,
              next as DatabaseButtonMutationOperation['op'],
            );
            if (replacement) onChange(replacement);
          }}
        >
          <SelectTrigger aria-label={`Operation ${position}`} className="h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OFFERED_OPERATIONS.map((candidate) => (
              <SelectItem
                key={candidate}
                value={candidate}
                disabled={freshOperation(source, candidate) === null}
              >
                {OPERATION_LABELS[candidate]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label className="text-[11px] text-muted-foreground">
          <Trans>Property</Trans>
        </Label>
        <Select
          value={targetId ?? RECORD_BODY_TARGET}
          onValueChange={(next) => {
            if (next === RECORD_BODY_TARGET) {
              onChange({ op: 'append', value: operation.op === 'append' ? operation.value : '' });
              return;
            }
            const property = source.properties.find((candidate) => candidate.id === next);
            if (!property) return;
            if (operation.op === 'set' && isEditableValueProperty(property)) {
              onChange({ op: 'set', propertyId: next, value: defaultButtonValue(property) });
              return;
            }
            if (operation.op === 'add' || operation.op === 'remove') {
              const option =
                property.type === 'multi_select'
                  ? property.options.find((candidate) => candidate.archived !== true)
                  : undefined;
              if (!option) return;
              onChange({ op: operation.op, propertyId: next, value: option.id });
              return;
            }
            onChange({ ...operation, propertyId: next });
          }}
        >
          <SelectTrigger aria-label={`Operation ${position} property`} className="h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operation.op === 'append' ? (
              <SelectItem value={RECORD_BODY_TARGET}>Record body</SelectItem>
            ) : null}
            {targets.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid min-w-44 flex-1 gap-1">
        <Label className="text-[11px] text-muted-foreground">
          <Trans>Value</Trans>
        </Label>
        {operation.op === 'unset' ? (
          <p className="py-1.5 text-muted-foreground text-xs">
            <Trans>Clears whatever the record holds.</Trans>
          </p>
        ) : operation.op === 'increment' ? (
          <Input
            type="number"
            aria-label={`Operation ${position} value`}
            className="h-8"
            value={String(operation.by)}
            onChange={(event) => onChange({ ...operation, by: Number(event.currentTarget.value) })}
          />
        ) : operation.op === 'append' ? (
          <Input
            aria-label={`Operation ${position} value`}
            className="h-8"
            value={operation.value}
            onChange={(event) => onChange({ ...operation, value: event.currentTarget.value })}
          />
        ) : operation.op === 'add' || operation.op === 'remove' ? (
          target?.type === 'multi_select' ? (
            <Select
              value={typeof operation.value === 'string' ? operation.value : ''}
              onValueChange={(next) => onChange({ ...operation, value: next })}
            >
              <SelectTrigger aria-label={`Operation ${position} value`} className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {target.options
                  .filter((option) => option.archived !== true)
                  .map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : null
        ) : operation.op === 'set' && target && isEditableValueProperty(target) ? (
          <ButtonValueInput
            property={target}
            value={operation.value}
            onChange={(value) => onChange({ op: 'set', propertyId: target.id, value })}
            label={`Operation ${position} value`}
          />
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove operation ${position}`}
        disabled={!removable}
        onClick={onRemove}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );
}

function CreateRecordEditor({
  database,
  action,
  onChange,
}: {
  database: DatabaseDefinition;
  action: Extract<DatabaseButtonAction, { kind: 'create_record' }>;
  onChange: (action: DatabaseButtonAction) => void;
}) {
  const targetSource = database.sources.find((source) => source.id === action.sourceId);
  const properties = targetSource?.properties ?? [];
  const assigned = Object.keys(action.values);
  const available = properties.filter(
    (property) => isEditableValueProperty(property) && !assigned.includes(property.id),
  );
  const setValue = (propertyId: string, value: DatabaseButtonLiteralValue) =>
    onChange({ ...action, values: { ...action.values, [propertyId]: value } });
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <Label className="text-[11px] text-muted-foreground">
          <Trans>Create in</Trans>
        </Label>
        <Select
          value={action.sourceId}
          onValueChange={(next) => {
            const source = database.sources.find((candidate) => candidate.id === next);
            if (!source) return;
            onChange({ ...action, sourceId: next, values: requiredCreateValues(source) });
          }}
        >
          <SelectTrigger aria-label="Create record source" className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {database.sources.map((source) => (
              <SelectItem key={source.id} value={source.id}>
                {source.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        {assigned.map((propertyId) => {
          const property = properties.find((candidate) => candidate.id === propertyId);
          const removable = !property?.required;
          return (
            <div key={propertyId} className="flex flex-wrap items-end gap-2">
              <div className="grid min-w-44 flex-1 gap-1">
                <Label className="text-[11px] text-muted-foreground">
                  {property?.name ?? propertyId}
                </Label>
                {property && isEditableValueProperty(property) ? (
                  <ButtonValueInput
                    property={property}
                    value={action.values[propertyId]}
                    onChange={(value) => setValue(propertyId, value)}
                    label={`${property.name} value`}
                  />
                ) : (
                  <code className="break-all text-xs">
                    {JSON.stringify(action.values[propertyId])}
                  </code>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${property?.name ?? propertyId} value`}
                disabled={removable === false}
                onClick={() =>
                  onChange({
                    ...action,
                    // Rebuilt by filtering rather than by a computed-key rest
                    // pattern, which the React Compiler cannot lower.
                    values: Object.fromEntries(
                      Object.entries(action.values).filter(([key]) => key !== propertyId),
                    ),
                  })
                }
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          );
        })}
        {available.length > 0 ? (
          <Select
            value=""
            onValueChange={(next) => {
              const property = properties.find((candidate) => candidate.id === next);
              if (property && isEditableValueProperty(property)) {
                setValue(next, defaultButtonValue(property));
              }
            }}
          >
            <SelectTrigger aria-label="Add a value" className="h-8 w-56">
              <SelectValue placeholder="Add a value" />
            </SelectTrigger>
            <SelectContent>
              {available.map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      <div className="grid gap-1">
        <Label className="text-[11px] text-muted-foreground">
          <Trans>Body</Trans>
        </Label>
        <Textarea
          aria-label="Created record body"
          className="min-h-16"
          value={action.body}
          onChange={(event) => onChange({ ...action, body: event.currentTarget.value })}
        />
      </div>
    </div>
  );
}

/**
 * Values a `create_record` action must carry for the target source to validate:
 * every required property without a manifest default.
 */
export function requiredCreateValues(
  source: DatabaseSource,
): Record<string, DatabaseButtonLiteralValue> {
  const values: Record<string, DatabaseButtonLiteralValue> = {};
  for (const property of source.properties) {
    if (!property.required || property.semantics.defaultValue !== undefined) continue;
    if (!isEditableValueProperty(property)) continue;
    values[property.id] = property.type === 'title' ? 'New record' : defaultButtonValue(property);
  }
  return values;
}

export const DATABASE_BUTTON_ACTION_LABELS: Readonly<Record<DatabaseButtonAction['kind'], string>> =
  {
    update_record: 'Edit this record',
    create_record: 'Create a record',
    archive_record: 'Archive or restore this record',
    external_webhook: 'Send to a webhook',
  };

/**
 * Kinds the picker offers. `external_webhook` names a `conn_` connection that
 * no surface in the app issues, so it can be kept and removed here but not
 * created.
 */
const OFFERED_KINDS: readonly DatabaseButtonAction['kind'][] = [
  'update_record',
  'create_record',
  'archive_record',
];

export function freshButtonAction(
  id: string,
  kind: DatabaseButtonAction['kind'],
  source: DatabaseSource,
): DatabaseButtonAction | null {
  if (kind === 'update_record') return { id, kind, operations: [seedButtonOperation(source)] };
  if (kind === 'create_record') {
    return { id, kind, sourceId: source.id, values: requiredCreateValues(source), body: '' };
  }
  if (kind === 'archive_record') return { id, kind, action: 'archive' };
  return null;
}

export function DatabaseButtonActionEditor({
  database,
  source,
  action,
  index,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  action: DatabaseButtonAction;
  index: number;
  count: number;
  onChange: (action: DatabaseButtonAction) => void;
  onRemove: () => void;
  onMove: (offset: -1 | 1) => void;
}) {
  const position = index + 1;
  return (
    <div className="grid gap-3 rounded-md border p-3" data-button-action-index={index}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">Step {position}</span>
        <Select
          value={action.kind}
          onValueChange={(next) => {
            const replacement = freshButtonAction(
              action.id,
              next as DatabaseButtonAction['kind'],
              source,
            );
            if (replacement) onChange(replacement);
          }}
        >
          <SelectTrigger aria-label={`Step ${position} action`} className="h-8 w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OFFERED_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {DATABASE_BUTTON_ACTION_LABELS[kind]}
              </SelectItem>
            ))}
            {action.kind === 'external_webhook' ? (
              <SelectItem value="external_webhook">
                {DATABASE_BUTTON_ACTION_LABELS.external_webhook}
              </SelectItem>
            ) : null}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Move step ${position} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ChevronUp aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Move step ${position} down`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ChevronDown aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove step ${position}`}
            disabled={count <= 1}
            onClick={onRemove}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
      {action.kind === 'update_record' ? (
        <div className="grid gap-2">
          {action.operations.map((operation, operationIndex) => (
            <OperationRow
              // biome-ignore lint/suspicious/noArrayIndexKey: operations carry no id — the manifest runs them in list order, so position is their identity.
              key={`${operation.op}:${'propertyId' in operation ? operation.propertyId : ''}:${operationIndex}`}
              source={source}
              operation={operation}
              index={operationIndex}
              removable={action.operations.length > 1}
              onChange={(next) =>
                onChange({
                  ...action,
                  operations: action.operations.map((candidate, candidateIndex) =>
                    candidateIndex === operationIndex ? next : candidate,
                  ),
                })
              }
              onRemove={() =>
                onChange({
                  ...action,
                  operations: action.operations.filter(
                    (_candidate, candidateIndex) => candidateIndex !== operationIndex,
                  ),
                })
              }
            />
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={action.operations.length >= 100}
              onClick={() =>
                onChange({
                  ...action,
                  operations: [...action.operations, seedButtonOperation(source)],
                })
              }
            >
              <Plus aria-hidden="true" />
              <Trans>Add operation</Trans>
            </Button>
          </div>
        </div>
      ) : action.kind === 'create_record' ? (
        <CreateRecordEditor database={database} action={action} onChange={onChange} />
      ) : action.kind === 'archive_record' ? (
        <div className="grid gap-1">
          <Label className="text-[11px] text-muted-foreground">
            <Trans>Then</Trans>
          </Label>
          <Select
            value={action.action}
            onValueChange={(next) => onChange({ ...action, action: next as 'archive' | 'restore' })}
          >
            <SelectTrigger aria-label={`Step ${position} archive mode`} className="h-8 w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="archive">Archive this record</SelectItem>
              <SelectItem value="restore">Restore this record</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          <Trans>
            This step posts to a connection configured outside the app. It is kept as-is; remove it
            here if it no longer applies.
          </Trans>
        </p>
      )}
    </div>
  );
}

import { Trans } from '@lingui/react/macro';
import type {
  DatabaseFilter,
  DatabaseFilterValue,
  DatabaseProperty,
  DatabaseQueryOperator,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import {
  databaseQueryOperatorsForProperty,
  validateDatabaseFilter,
} from '@nedian0brien/synapsenote-core';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type EditorNode =
  | { id: string; kind: 'rule'; propertyId: string; operator: DatabaseQueryOperator; value: string }
  | { id: string; kind: 'and'; children: EditorNode[] }
  | { id: string; kind: 'or'; children: EditorNode[] }
  | { id: string; kind: 'not'; child: EditorNode };

let nextNodeId = 0;
function nodeId(): string {
  nextNodeId += 1;
  return `filter-node-${nextNodeId}`;
}

function defaultRule(source: DatabaseSource): EditorNode {
  const property = source.properties[0];
  if (!property) throw new Error('A filter requires at least one property');
  return {
    id: nodeId(),
    kind: 'rule',
    propertyId: property.id,
    operator: databaseQueryOperatorsForProperty(property)[0] ?? 'eq',
    value: '',
  };
}

function editorNode(filter: DatabaseFilter): EditorNode {
  if ('and' in filter) {
    return { id: nodeId(), kind: 'and', children: filter.and.map(editorNode) };
  }
  if ('or' in filter) {
    return { id: nodeId(), kind: 'or', children: filter.or.map(editorNode) };
  }
  if ('not' in filter) return { id: nodeId(), kind: 'not', child: editorNode(filter.not) };
  return {
    id: nodeId(),
    kind: 'rule',
    propertyId: filter.propertyId,
    operator: filter.operator,
    value:
      'value' in filter
        ? typeof filter.value === 'string'
          ? filter.value
          : JSON.stringify(filter.value)
        : '',
  };
}

function isNumericProperty(property: DatabaseProperty): boolean {
  return (
    property.type === 'number' ||
    property.type === 'unique_id' ||
    (property.type === 'formula' && property.ast.resultType === 'number') ||
    (property.type === 'rollup' &&
      !['earliest', 'latest', 'show_original'].includes(property.function))
  );
}

function isBooleanProperty(property: DatabaseProperty): boolean {
  return (
    property.type === 'checkbox' ||
    (property.type === 'formula' && property.ast.resultType === 'boolean')
  );
}

function filterValue(
  node: Extract<EditorNode, { kind: 'rule' }>,
  property: DatabaseProperty,
): DatabaseFilterValue {
  if (node.operator === 'in') {
    const parsed: unknown = JSON.parse(node.value);
    if (!Array.isArray(parsed)) throw new Error('The “in” operator requires a JSON array');
    return parsed as DatabaseFilterValue;
  }
  if (isNumericProperty(property)) {
    const value = Number(node.value);
    if (!Number.isFinite(value)) throw new Error(`${property.name} requires a finite number`);
    return value;
  }
  if (isBooleanProperty(property)) {
    if (node.value === 'true') return true;
    if (node.value === 'false') return false;
    throw new Error(`${property.name} requires true or false`);
  }
  return node.value;
}

function databaseFilter(node: EditorNode, source: DatabaseSource): DatabaseFilter {
  if (node.kind === 'and') {
    if (node.children.length === 0) throw new Error('AND groups must contain a condition');
    return { and: node.children.map((child) => databaseFilter(child, source)) };
  }
  if (node.kind === 'or') {
    if (node.children.length === 0) throw new Error('OR groups must contain a condition');
    return { or: node.children.map((child) => databaseFilter(child, source)) };
  }
  if (node.kind === 'not') return { not: databaseFilter(node.child, source) };
  const property = source.properties.find((candidate) => candidate.id === node.propertyId);
  if (!property) throw new Error('A filter references a missing property');
  if (node.operator === 'is_empty' || node.operator === 'is_not_empty') {
    return { propertyId: property.id, operator: node.operator };
  }
  return { propertyId: property.id, operator: node.operator, value: filterValue(node, property) };
}

function FilterNodeEditor({
  node,
  source,
  onChange,
  onRemove,
}: {
  node: EditorNode;
  source: DatabaseSource;
  onChange: (node: EditorNode) => void;
  onRemove?: () => void;
}) {
  if (node.kind === 'rule') {
    const property =
      source.properties.find((candidate) => candidate.id === node.propertyId) ??
      source.properties[0];
    const operators = property ? databaseQueryOperatorsForProperty(property) : [];
    const hasValue = node.operator !== 'is_empty' && node.operator !== 'is_not_empty';
    return (
      <div
        className="flex flex-wrap items-center gap-2 rounded border bg-background p-2"
        data-filter-node="rule"
      >
        <Select
          value={node.propertyId}
          onValueChange={(propertyId) => {
            const nextProperty = source.properties.find((candidate) => candidate.id === propertyId);
            onChange({
              ...node,
              propertyId,
              operator: nextProperty
                ? (databaseQueryOperatorsForProperty(nextProperty)[0] ?? 'eq')
                : 'eq',
              value: '',
            });
          }}
        >
          <SelectTrigger size="sm" className="min-w-40" aria-label="Filter property">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {source.properties.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={node.operator}
          onValueChange={(operator) =>
            onChange({ ...node, operator: operator as DatabaseQueryOperator })
          }
        >
          <SelectTrigger size="sm" className="min-w-36" aria-label="Filter operator">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operators.map((operator) => (
              <SelectItem key={operator} value={operator}>
                {operator}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasValue ? (
          <Input
            className="h-8 min-w-48 flex-1"
            aria-label={`Filter value for ${property?.name ?? 'property'}`}
            placeholder={node.operator === 'in' ? '["value-a", "value-b"]' : 'Value'}
            value={node.value}
            onChange={(event) => onChange({ ...node, value: event.currentTarget.value })}
          />
        ) : null}
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Remove condition"
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>
    );
  }
  if (node.kind === 'not') {
    return (
      <div className="space-y-2 rounded border border-dashed p-2" data-filter-node="not">
        <div className="flex items-center justify-between">
          <strong className="text-xs">NOT</strong>
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Remove NOT group"
              onClick={onRemove}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
        <FilterNodeEditor
          node={node.child}
          source={source}
          onChange={(child) => onChange({ ...node, child })}
        />
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded border bg-muted/20 p-2" data-filter-node={node.kind}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select
          value={node.kind}
          onValueChange={(kind) => onChange({ ...node, kind: kind as 'and' | 'or' })}
        >
          <SelectTrigger size="sm" className="w-28" aria-label="Filter group operator">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="and">AND</SelectItem>
            <SelectItem value="or">OR</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange({ ...node, children: [...node.children, defaultRule(source)] })}
          >
            <Plus /> <Trans>Condition</Trans>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onChange({
                ...node,
                children: [
                  ...node.children,
                  { id: nodeId(), kind: 'and', children: [defaultRule(source)] },
                ],
              })
            }
          >
            <Plus /> <Trans>Group</Trans>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onChange({
                ...node,
                children: [
                  ...node.children,
                  { id: nodeId(), kind: 'not', child: defaultRule(source) },
                ],
              })
            }
          >
            <Plus /> NOT
          </Button>
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Remove filter group"
              onClick={onRemove}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
      </div>
      {node.children.map((child, index) => (
        <FilterNodeEditor
          key={child.id}
          node={child}
          source={source}
          onChange={(nextChild) =>
            onChange({
              ...node,
              children: node.children.map((candidate, childIndex) =>
                childIndex === index ? nextChild : candidate,
              ),
            })
          }
          onRemove={() =>
            onChange({
              ...node,
              children: node.children.filter((_, childIndex) => childIndex !== index),
            })
          }
        />
      ))}
    </div>
  );
}

export function DatabaseAdvancedFilterDialog({
  open,
  onOpenChange,
  source,
  initialWhere,
  onSave,
  allowClear = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: DatabaseSource;
  initialWhere?: DatabaseFilter;
  onSave: (where: DatabaseFilter | undefined) => void;
  allowClear?: boolean;
}) {
  'use no memo';
  const [root, setRoot] = useState<EditorNode>(() =>
    initialWhere
      ? editorNode(initialWhere)
      : { id: nodeId(), kind: 'and', children: [defaultRule(source)] },
  );
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    try {
      const where = databaseFilter(root, source);
      validateDatabaseFilter(source, where);
      onSave(where);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid filter group');
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Advanced saved filters</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Build nested AND, OR, and NOT groups using stable property identities.</Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <FilterNodeEditor
            node={root}
            source={source}
            onChange={(node) => {
              setRoot(node);
              setError(null);
            }}
          />
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-between gap-2">
            {allowClear ? (
              <Button variant="ghost" onClick={() => onSave(undefined)}>
                <Trans>Clear saved filters</Trans>
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                <Trans>Cancel</Trans>
              </Button>
              <Button onClick={save}>
                <Trans>Review filter change</Trans>
              </Button>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

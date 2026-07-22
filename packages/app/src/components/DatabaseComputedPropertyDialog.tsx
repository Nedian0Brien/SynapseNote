import { Trans } from '@lingui/react/macro';
import type {
  DatabaseDateValue,
  DatabaseDefinition,
  DatabaseFileValue,
  DatabasePlaceValue,
  DatabaseProperty,
  DatabaseRollupFunction,
  DatabaseSource,
  DatabaseVerificationValue,
  FormulaComputedResult,
  FormulaPersistedRuntimeValue,
  FormulaValueType,
  ProjectedDatabasePerson,
  ProjectedDatabaseRecord,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import {
  analyzeFormulaEditor,
  DATABASE_ROLLUP_FUNCTIONS,
  databaseDateStart,
  databaseFileDisplayName,
  databasePlaceSearchText,
  formatDatabaseUniqueId,
  formulaErrorResult,
  formulaValueResult,
} from '@nedian0brien/synapsenote-core';
import { AlertCircle, CheckCircle2, FunctionSquare, Search } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  type DatabaseComputedPropertyPreviewResult,
  previewDatabaseComputedProperty,
} from '@/lib/database-query-client';

type ComputedProperty = Extract<DatabaseProperty, { type: 'formula' | 'rollup' }>;

function propertyValueType(property: DatabaseProperty): {
  valueType: FormulaValueType;
  itemType?: FormulaValueType;
} {
  switch (property.type) {
    case 'title':
    case 'text':
    case 'select':
    case 'status':
    case 'url':
    case 'email':
    case 'phone':
    case 'created_by':
    case 'last_edited_by':
    case 'verification':
    case 'unique_id':
    case 'place':
      return { valueType: 'text' };
    case 'button':
      return { valueType: 'null' };
    case 'number':
      return { valueType: 'number' };
    case 'checkbox':
      return { valueType: 'boolean' };
    case 'date':
    case 'created_time':
    case 'last_edited_time':
      return { valueType: 'date' };
    case 'multi_select':
    case 'files':
      return { valueType: 'list', itemType: 'text' };
    case 'person':
      return property.multiple
        ? { valueType: 'list', itemType: 'person' }
        : { valueType: 'person' };
    case 'relation':
      return property.cardinality === 'many'
        ? { valueType: 'list', itemType: 'page' }
        : { valueType: 'page' };
    case 'formula':
      return { valueType: property.ast.resultType };
    case 'rollup':
      if (property.function === 'earliest' || property.function === 'latest') {
        return { valueType: 'date' };
      }
      if (property.function === 'show_original') {
        return {
          valueType: 'list',
          itemType:
            property.targetValueType === 'list'
              ? property.targetItemType
              : property.targetValueType,
        };
      }
      return { valueType: 'number' };
  }
}

function formulaPreviewValue(
  _definition: DatabaseDefinition,
  source: DatabaseSource,
  record: ProjectedDatabaseRecord | null,
  people: readonly ProjectedDatabasePerson[],
  relations: readonly ProjectedDatabaseRelationRecord[],
  propertyId: string,
): FormulaComputedResult {
  if (!record) {
    return formulaErrorResult({
      code: 'missing_record',
      message: 'No readable record is available for preview',
      propertyId,
    });
  }
  const property = source.properties.find((candidate) => candidate.id === propertyId);
  if (!property) {
    return formulaErrorResult({
      code: 'missing_property',
      message: `Property "${propertyId}" is not defined in this source`,
      propertyId,
    });
  }
  const computed = record.computedResults?.[property.id];
  if (computed) return computed;
  const value = record.values[property.id];
  if (value === undefined) return formulaValueResult('null', null);
  switch (property.type) {
    case 'title':
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
    case 'created_by':
    case 'last_edited_by':
      return formulaValueResult('text', value as string);
    case 'verification':
      return formulaValueResult('text', (value as DatabaseVerificationValue).state);
    case 'unique_id':
      return formulaValueResult('text', formatDatabaseUniqueId(property.prefix, value as number));
    case 'place':
      return formulaValueResult('text', databasePlaceSearchText(value as DatabasePlaceValue));
    case 'button':
      return formulaValueResult('null', null);
    case 'number':
      return formulaValueResult('number', value as number);
    case 'checkbox':
      return formulaValueResult('boolean', value as boolean);
    case 'date':
      return formulaValueResult('date', {
        kind: 'date',
        value: databaseDateStart(value as DatabaseDateValue),
      });
    case 'created_time':
    case 'last_edited_time':
      return formulaValueResult('date', { kind: 'date', value: String(value) });
    case 'select':
    case 'status': {
      const option = property.options.find((candidate) => candidate.id === value);
      return option
        ? formulaValueResult('text', option.name)
        : formulaErrorResult({
            code: 'missing_projection',
            message: 'The selected option is not readable',
            propertyId,
          });
    }
    case 'multi_select':
      return formulaValueResult(
        'list',
        (value as string[]).map(
          (optionId) =>
            property.options.find((candidate) => candidate.id === optionId)?.name ?? optionId,
        ),
      );
    case 'person': {
      const projected = (value as string[]).map((personId) => {
        const person = people.find((candidate) => candidate.id === personId);
        return { kind: 'person' as const, id: personId, ...(person ? { name: person.name } : {}) };
      });
      return property.multiple
        ? formulaValueResult('list', projected)
        : projected[0]
          ? formulaValueResult('person', projected[0])
          : formulaValueResult('null', null);
    }
    case 'files':
      return formulaValueResult(
        'list',
        (value as DatabaseFileValue[]).map((file) => databaseFileDisplayName(file)),
      );
    case 'relation': {
      const ids = (Array.isArray(value) ? value : [value]) as string[];
      const pages = ids.flatMap((recordId) => {
        const relation = relations.find((candidate) => candidate.id === recordId);
        return relation
          ? [
              {
                kind: 'page' as const,
                id: relation.id,
                sourceId: relation.sourceId,
                title: relation.title,
              },
            ]
          : [];
      });
      return property.cardinality === 'many'
        ? formulaValueResult('list', pages)
        : pages[0]
          ? formulaValueResult('page', pages[0])
          : formulaValueResult('null', null);
    }
    case 'formula':
    case 'rollup':
      return formulaErrorResult({
        code: 'missing_projection',
        message: 'The computed dependency is absent from this query snapshot',
        propertyId,
      });
  }
}

function resultText(result: FormulaComputedResult | undefined): string {
  if (!result) return 'Preview unavailable';
  if (result.kind === 'error') return `${result.problem.code}: ${result.problem.message}`;
  const text = (value: FormulaPersistedRuntimeValue): string => {
    if (value === null) return 'null';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) return `[${value.map(text).join(', ')}]`;
    if (value.kind === 'date') return value.value;
    if (value.kind === 'person') return value.name ?? value.id;
    return value.title ?? value.id;
  };
  return `${result.valueType}: ${text(result.value)}`;
}

function rollupFunctionAllowed(
  function_: DatabaseRollupFunction,
  target: ReturnType<typeof propertyValueType>,
): boolean {
  const projected = target.valueType === 'list' ? target.itemType : target.valueType;
  if (['sum', 'average', 'min', 'max'].includes(function_)) return projected === 'number';
  if (function_ === 'earliest' || function_ === 'latest') return projected === 'date';
  return true;
}

export function DatabaseComputedPropertyDialog({
  open,
  onOpenChange,
  definition,
  source,
  property,
  previewRecord,
  people,
  relationRecords,
  evaluationNow,
  loadComputedPreview = previewDatabaseComputedProperty,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definition: DatabaseDefinition;
  source: DatabaseSource;
  property: ComputedProperty;
  previewRecord: ProjectedDatabaseRecord | null;
  people: readonly ProjectedDatabasePerson[];
  relationRecords: readonly ProjectedDatabaseRelationRecord[];
  evaluationNow: string;
  loadComputedPreview?: (
    input: {
      databaseId: string;
      sourceId: string;
      recordId: string;
      property: ComputedProperty;
    },
    options?: { signal?: AbortSignal },
  ) => Promise<DatabaseComputedPropertyPreviewResult>;
  onSave: (property: ComputedProperty) => void;
}) {
  const [formulaSource, setFormulaSource] = useState(
    property.type === 'formula' ? property.source : '',
  );
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [relationPropertyId, setRelationPropertyId] = useState(
    property.type === 'rollup' ? property.relationPropertyId : '',
  );
  const [targetPropertyId, setTargetPropertyId] = useState(
    property.type === 'rollup' ? property.targetPropertyId : '',
  );
  const [function_, setFunction] = useState<DatabaseRollupFunction>(
    property.type === 'rollup' ? property.function : 'count_all',
  );
  const [rollupPreviewState, setRollupPreviewState] = useState<
    | { key: string; state: 'loading' }
    | { key: string; state: 'ready'; preview: DatabaseComputedPropertyPreviewResult }
    | { key: string; state: 'error'; message: string }
  >({ key: '', state: 'loading' });
  const formulaAnalysis =
    property.type === 'formula'
      ? analyzeFormulaEditor({
          source: formulaSource,
          definition,
          sourceId: source.id,
          resultType: property.ast.resultType,
          suggestionQuery,
          preview: {
            context: {
              now: evaluationNow,
              timeZone: 'UTC',
              locale: 'en',
            },
            resolveProperty: ({ propertyId }) =>
              formulaPreviewValue(
                definition,
                source,
                previewRecord,
                people,
                relationRecords,
                propertyId,
              ),
          },
        })
      : null;
  const relations = source.properties.filter(
    (candidate): candidate is Extract<DatabaseProperty, { type: 'relation' }> =>
      candidate.type === 'relation',
  );
  const relation = relations.find((candidate) => candidate.id === relationPropertyId);
  const targetSource = definition.sources.find(
    (candidate) => candidate.id === relation?.targetSourceId,
  );
  const targets = targetSource?.properties ?? [];
  const target = targets.find((candidate) => candidate.id === targetPropertyId);
  const targetType = target ? propertyValueType(target) : null;
  const rollupValid = Boolean(
    property.type === 'rollup' &&
      relation &&
      target &&
      targetType &&
      rollupFunctionAllowed(function_, targetType),
  );
  const selectedRelationId = relation?.id;
  const selectedTargetId = target?.id;
  const selectedTargetValueType = targetType?.valueType;
  const selectedTargetItemType = targetType?.itemType;
  const rollupPreviewKey =
    property.type === 'rollup' &&
    rollupValid &&
    selectedRelationId &&
    selectedTargetId &&
    selectedTargetValueType &&
    previewRecord
      ? JSON.stringify({
          recordId: previewRecord.id,
          recordRevision: previewRecord.revision,
          propertyId: property.id,
          relationPropertyId: selectedRelationId,
          targetPropertyId: selectedTargetId,
          function: function_,
          targetValueType: selectedTargetValueType,
          targetItemType: selectedTargetItemType,
        })
      : '';

  useEffect(() => {
    if (
      property.type !== 'rollup' ||
      !rollupValid ||
      !selectedRelationId ||
      !selectedTargetId ||
      !selectedTargetValueType ||
      !previewRecord
    ) {
      return;
    }
    const candidate: ComputedProperty = {
      ...property,
      relationPropertyId: selectedRelationId,
      targetPropertyId: selectedTargetId,
      function: function_,
      targetValueType: selectedTargetValueType,
      ...(selectedTargetItemType ? { targetItemType: selectedTargetItemType } : {}),
    };
    const controller = new AbortController();
    const key = rollupPreviewKey;
    setRollupPreviewState({ key, state: 'loading' });
    void loadComputedPreview(
      {
        databaseId: definition.id,
        sourceId: source.id,
        recordId: previewRecord.id,
        property: candidate,
      },
      { signal: controller.signal },
    ).then(
      (preview) => {
        if (!controller.signal.aborted) {
          setRollupPreviewState({ key, state: 'ready', preview });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setRollupPreviewState({
            key,
            state: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => controller.abort();
  }, [
    definition.id,
    loadComputedPreview,
    previewRecord,
    property,
    rollupValid,
    rollupPreviewKey,
    selectedRelationId,
    selectedTargetId,
    selectedTargetItemType,
    selectedTargetValueType,
    source.id,
    function_,
  ]);

  const currentRollupPreview =
    rollupPreviewState.key === rollupPreviewKey ? rollupPreviewState : null;
  const preview =
    property.type === 'formula'
      ? formulaAnalysis?.preview
      : currentRollupPreview?.state === 'ready'
        ? currentRollupPreview.preview.result
        : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FunctionSquare className="size-4" /> {property.name}
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Edit a read-only computed property with stable references and snapshot preview.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {property.type === 'formula' && formulaAnalysis ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="database-formula-source">
                  <Trans>Formula source</Trans>
                </Label>
                <Textarea
                  id="database-formula-source"
                  value={formulaSource}
                  aria-invalid={!formulaAnalysis.valid}
                  aria-describedby={
                    formulaAnalysis.valid ? undefined : 'database-formula-diagnostics'
                  }
                  className="min-h-32 font-mono"
                  onChange={(event) => setFormulaSource(event.currentTarget.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="database-formula-suggestions">
                    <Trans>References and functions</Trans>
                  </Label>
                  <div className="relative">
                    <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                    <Input
                      id="database-formula-suggestions"
                      value={suggestionQuery}
                      className="pl-8"
                      placeholder="Search properties and functions"
                      onChange={(event) => setSuggestionQuery(event.currentTarget.value)}
                    />
                  </div>
                  <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                    {formulaAnalysis.suggestions.slice(0, 24).map((suggestion) => (
                      <Button
                        key={`${suggestion.kind}:${suggestion.label}`}
                        type="button"
                        variant="outline"
                        size="xs"
                        title={suggestion.detail}
                        onClick={() =>
                          setFormulaSource(
                            (current) =>
                              `${current}${current.trim() ? ' ' : ''}${suggestion.insertText}`,
                          )
                        }
                      >
                        {suggestion.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>
                    <Trans>Resolved stable references</Trans>
                  </Label>
                  <div className="flex min-h-9 flex-wrap gap-1 rounded-md border p-2">
                    {formulaAnalysis.references.length > 0 ? (
                      formulaAnalysis.references.map((reference) => (
                        <Badge
                          key={reference.propertyId}
                          variant="gray"
                          title={reference.propertyId}
                        >
                          {reference.name} · {reference.propertyType}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-xs">No resolved references</span>
                    )}
                  </div>
                </div>
              </div>
              {formulaAnalysis.valid ? (
                <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-green-700 dark:text-green-300">
                    <CheckCircle2 className="size-4" /> <Trans>Formula is valid</Trans>
                  </div>
                  <code className="mt-1 block break-all text-xs">
                    {formulaAnalysis.canonicalSource}
                  </code>
                </div>
              ) : (
                <div
                  id="database-formula-diagnostics"
                  className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm"
                  role="alert"
                >
                  {formulaAnalysis.diagnostics.map((diagnostic) => (
                    <div
                      key={`${diagnostic.phase}:${diagnostic.code}:${diagnostic.offset ?? ''}:${diagnostic.path?.join('.') ?? ''}:${diagnostic.message}`}
                      className="flex gap-2"
                    >
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      <span>
                        {diagnostic.line ? `${diagnostic.line}:${diagnostic.column} · ` : ''}
                        {diagnostic.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : property.type === 'rollup' ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>
                  <Trans>Relation</Trans>
                </Label>
                <Select
                  value={relationPropertyId}
                  onValueChange={(value) => {
                    setRelationPropertyId(value);
                    setTargetPropertyId('');
                  }}
                >
                  <SelectTrigger aria-label="Rollup relation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {relations.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  <Trans>Target property</Trans>
                </Label>
                <Select value={targetPropertyId} onValueChange={setTargetPropertyId}>
                  <SelectTrigger aria-label="Rollup target property">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.name} · {candidate.type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  <Trans>Aggregation</Trans>
                </Label>
                <Select
                  value={function_}
                  onValueChange={(value) => setFunction(value as DatabaseRollupFunction)}
                >
                  <SelectTrigger aria-label="Rollup aggregation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATABASE_ROLLUP_FUNCTIONS.map((candidate) => (
                      <SelectItem
                        key={candidate}
                        value={candidate}
                        disabled={Boolean(
                          targetType && !rollupFunctionAllowed(candidate, targetType),
                        )}
                      >
                        {candidate.replaceAll('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!rollupValid ? (
                <p className="text-destructive text-sm sm:col-span-3" role="alert">
                  <Trans>Choose a compatible relation, target property, and aggregation.</Trans>
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="mb-1 font-medium text-sm">
              <Trans>Snapshot preview</Trans>
            </div>
            {property.type === 'rollup' && !previewRecord ? (
              <p className="text-muted-foreground text-xs" role="status">
                <Trans>No readable record is available for Rollup preview.</Trans>
              </p>
            ) : property.type === 'rollup' &&
              (!currentRollupPreview || currentRollupPreview.state === 'loading') ? (
              <p className="text-muted-foreground text-xs" role="status">
                <Trans>Calculating the unsaved Rollup against the permission snapshot.</Trans>
              </p>
            ) : property.type === 'rollup' && currentRollupPreview?.state === 'error' ? (
              <p className="text-destructive text-xs" role="alert">
                {currentRollupPreview.message}
              </p>
            ) : (
              <code
                className={
                  preview?.kind === 'error'
                    ? 'block whitespace-pre-wrap text-destructive text-xs'
                    : 'block whitespace-pre-wrap text-xs'
                }
              >
                {resultText(preview)}
              </code>
            )}
            {property.type === 'rollup' && currentRollupPreview?.state === 'ready' ? (
              <p className="mt-1 text-muted-foreground text-xs">
                <Trans>
                  Unsaved Rollup preview · UTC · permission-scoped · evaluated at{' '}
                  {currentRollupPreview.preview.evaluatedAt}
                </Trans>
              </p>
            ) : null}
            {property.type === 'formula' && formulaAnalysis?.valid ? (
              <p className="mt-1 text-muted-foreground text-xs">
                <Trans>
                  Formula preview · UTC · deterministic null and error semantics · evaluated at{' '}
                  {evaluationNow}
                </Trans>
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              disabled={
                property.type === 'formula' ? !formulaAnalysis?.valid : !rollupValid || !targetType
              }
              onClick={() => {
                if (property.type === 'formula' && formulaAnalysis?.valid && formulaAnalysis.ast) {
                  onSave({
                    ...property,
                    source: formulaAnalysis.canonicalSource ?? formulaSource,
                    ast: formulaAnalysis.ast,
                  });
                  return;
                }
                if (
                  property.type === 'rollup' &&
                  rollupValid &&
                  selectedRelationId &&
                  selectedTargetId &&
                  selectedTargetValueType
                ) {
                  onSave({
                    ...property,
                    relationPropertyId: selectedRelationId,
                    targetPropertyId: selectedTargetId,
                    function: function_,
                    targetValueType: selectedTargetValueType,
                    ...(selectedTargetItemType ? { targetItemType: selectedTargetItemType } : {}),
                  });
                }
              }}
            >
              <Trans>Review change</Trans>
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

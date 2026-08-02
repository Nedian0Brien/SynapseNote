/* biome-ignore-all lint/suspicious/noExplicitAny: the remaining `any` params read from values the controller command bag still supplies untyped (selectedOptionProperty, selectProperties, bulkProperty, compatibleMoveTargets). Everything sourced from the render context is typed; these resolve once DatabaseWorkspaceControllerContext is typed too. */
import { Trans } from '@lingui/react/macro';
import { Copy, Loader2 } from 'lucide-react';
import { DatabaseFilesCellEditor } from '@/components/DatabaseFilesCellEditor';
import { DatabaseRelationCellEditor } from '@/components/DatabaseRelationCellEditor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isDatabaseCellEditable } from '@/lib/database-cell-mutation';
import { initialCellDraft, multiSelectDraftValues } from './database-table-utils';
import type { DatabaseWorkspaceRenderContext } from './database-workspace-context';

export function DatabaseWorkspaceRecordActions({
  context,
}: {
  context: DatabaseWorkspaceRenderContext;
}) {
  const {
    isPagePresentation,
    createRecord,
    setNewRecordOpen,
    description,
    selectedOptionProperty,
    selectedOption,
    selectProperties,
    setOptionId,
    setOptionName,
    setOptionColor,
    setOptionMergeTargetId,
    setOptionPreview,
    optionId,
    selectedOptionTypeLabel,
    optionName,
    optionColor,
    optionStatus,
    prepareSelectOptionChange,
    optionMergeTargetId,
    optionPreview,
    mutationStatus,
    importPreview,
    moveTargetSourceId,
    selectedRecordIds,
    result,
    bulkProperty,
    bulkDraft,
    setBulkDraft,
    planBulkEdit,
    newRecordOpen,
    pageTitleEditing,
    newRecordTitle,
    setNewRecordTitle,
    newRecordTemplateId,
    setNewRecordTemplateId,
    selectOptionsOpen,
    setSelectOptionsOpen,
    optionPropertyId,
    setOptionPropertyId,
    planSelectOptionChange,
    setImportPreview,
    csvStatus,
    commitImportPreview,
    moveRecord,
    setMoveTargetSourceId,
    compatibleMoveTargets,
    planMove,
    setMoveRecord,
    copySelectedRecords,
    bulkPropertyId,
    setBulkPropertyId,
    personLabels,
    relationCandidates,
    searchRelationCandidates,
    planBulkCheckboxToggle,
    setSelectedRecordIds,
  } = context;

  // DatabaseWorkspaceSuccessContent mounts this slice only once
  // `description?.source` resolves and a `result` page exists; restate both
  // preconditions so the branches below can rely on them.
  if (!description?.source || !result) return null;

  return (
    <>
      {newRecordOpen ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
          <Input
            autoFocus={!pageTitleEditing}
            value={newRecordTitle}
            aria-label={isPagePresentation ? 'New page title' : 'New record title'}
            placeholder={isPagePresentation ? 'New page' : 'Record title'}
            className="min-w-56 flex-1"
            onChange={(event) => setNewRecordTitle(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') createRecord();
              if (event.key === 'Escape') setNewRecordOpen(false);
            }}
          />
          <Select value={newRecordTemplateId} onValueChange={setNewRecordTemplateId}>
            <SelectTrigger
              size="sm"
              className="min-w-44"
              aria-label={isPagePresentation ? 'New page template' : 'New record template'}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto__">
                <Trans>Automatic default</Trans>
              </SelectItem>
              <SelectItem value="__blank__">
                {isPagePresentation ? <Trans>Blank page</Trans> : <Trans>Blank record</Trans>}
              </SelectItem>
              {description.database.templates
                .filter(
                  (template) =>
                    template.sourceId === description.source?.id && template.archivedAt === null,
                )
                .sort((left, right) => left.order - right.order)
                .map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setNewRecordOpen(false)}>
            <Trans>Cancel</Trans>
          </Button>
          <Button size="sm" onClick={() => createRecord()}>
            {isPagePresentation ? <Trans>Add page</Trans> : <Trans>Plan new record</Trans>}
          </Button>
        </div>
      ) : null}
      {selectedOptionProperty && selectedOption && selectOptionsOpen ? (
        <details
          open={selectOptionsOpen}
          onToggle={(event) => setSelectOptionsOpen(event.currentTarget.open)}
          className="rounded-md border bg-muted/10 p-3"
        >
          <summary className="cursor-pointer font-medium text-sm">
            {selectedOptionProperty.type === 'multi_select' ? (
              <Trans>Manage Multi-select options</Trans>
            ) : (
              <Trans>Manage Select options</Trans>
            )}
          </summary>
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1 text-xs">
                <span className="text-muted-foreground">
                  <Trans>Property</Trans>
                </span>
                <Select
                  value={optionPropertyId}
                  onValueChange={(propertyId) => {
                    const property = selectProperties.find(
                      (candidate: any) => candidate.id === propertyId,
                    );
                    const option = property?.options[0];
                    setOptionPropertyId(propertyId);
                    setOptionId(option?.id ?? '');
                    setOptionName(option?.name ?? '');
                    setOptionColor(option?.color ?? '');
                    setOptionMergeTargetId(
                      property?.options.find(
                        (candidate: any) =>
                          candidate.id !== option?.id && candidate.archived !== true,
                      )?.id ?? '',
                    );
                    setOptionPreview(null);
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="min-w-40"
                    aria-label={`${selectedOptionTypeLabel} property`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectProperties.map((property: any) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 text-xs">
                <span className="text-muted-foreground">
                  <Trans>Option</Trans>
                </span>
                <Select
                  value={optionId}
                  onValueChange={(nextOptionId) => {
                    const option = selectedOptionProperty.options.find(
                      (candidate: any) => candidate.id === nextOptionId,
                    );
                    setOptionId(nextOptionId);
                    setOptionName(option?.name ?? '');
                    setOptionColor(option?.color ?? '');
                    setOptionMergeTargetId(
                      selectedOptionProperty.options.find(
                        (candidate: any) =>
                          candidate.id !== nextOptionId && candidate.archived !== true,
                      )?.id ?? '',
                    );
                    setOptionPreview(null);
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="min-w-40"
                    aria-label={`${selectedOptionTypeLabel} option`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedOptionProperty.options.map((option: any) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                        {option.archived === true ? ' (archived)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 text-xs">
                <span className="text-muted-foreground">
                  <Trans>Name</Trans>
                </span>
                <Input
                  value={optionName}
                  className="h-8 w-40"
                  aria-label={`${selectedOptionTypeLabel} option name`}
                  onChange={(event) => setOptionName(event.currentTarget.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={optionStatus !== 'idle'}
                onClick={() =>
                  prepareSelectOptionChange({
                    kind: 'rename',
                    optionId: selectedOption.id,
                    name: optionName,
                  })
                }
              >
                <Trans>Preview rename</Trans>
              </Button>
              <div className="space-y-1 text-xs">
                <span className="text-muted-foreground">
                  <Trans>Color</Trans>
                </span>
                <Input
                  value={optionColor}
                  className="h-8 w-32"
                  aria-label={`${selectedOptionTypeLabel} option color`}
                  placeholder="blue"
                  onChange={(event) => setOptionColor(event.currentTarget.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={optionStatus !== 'idle'}
                onClick={() =>
                  prepareSelectOptionChange({
                    kind: 'recolor',
                    optionId: selectedOption.id,
                    ...(optionColor.trim() ? { color: optionColor.trim() } : {}),
                  })
                }
              >
                <Trans>Preview color</Trans>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={
                  optionStatus !== 'idle' ||
                  selectedOptionProperty.options[0]?.id === selectedOption.id
                }
                onClick={() => {
                  const optionIds = selectedOptionProperty.options.map((option: any) => option.id);
                  const index = optionIds.indexOf(selectedOption.id);
                  [optionIds[index - 1], optionIds[index]] = [
                    optionIds[index] as string,
                    optionIds[index - 1] as string,
                  ];
                  prepareSelectOptionChange({
                    kind: 'reorder',
                    optionIds,
                  });
                }}
              >
                <Trans>Preview move up</Trans>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  optionStatus !== 'idle' ||
                  selectedOptionProperty.options.at(-1)?.id === selectedOption.id
                }
                onClick={() => {
                  const optionIds = selectedOptionProperty.options.map((option: any) => option.id);
                  const index = optionIds.indexOf(selectedOption.id);
                  [optionIds[index], optionIds[index + 1]] = [
                    optionIds[index + 1] as string,
                    optionIds[index] as string,
                  ];
                  prepareSelectOptionChange({
                    kind: 'reorder',
                    optionIds,
                  });
                }}
              >
                <Trans>Preview move down</Trans>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={optionStatus !== 'idle'}
                onClick={() =>
                  prepareSelectOptionChange({
                    kind: 'archive',
                    optionId: selectedOption.id,
                    archived: selectedOption.archived !== true,
                  })
                }
              >
                {selectedOption.archived === true ? (
                  <Trans>Preview restore option</Trans>
                ) : (
                  <Trans>Preview archive option</Trans>
                )}
              </Button>
              {selectedOptionProperty.options.some(
                (option: any) => option.id !== selectedOption.id && option.archived !== true,
              ) ? (
                <>
                  <Select value={optionMergeTargetId} onValueChange={setOptionMergeTargetId}>
                    <SelectTrigger size="sm" className="min-w-40" aria-label="Merge target option">
                      <SelectValue placeholder="Merge target" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedOptionProperty.options
                        .filter(
                          (option: any) =>
                            option.id !== selectedOption.id && option.archived !== true,
                        )
                        .map((option: any) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={optionStatus !== 'idle' || !optionMergeTargetId}
                    onClick={() =>
                      prepareSelectOptionChange({
                        kind: 'merge',
                        sourceOptionId: selectedOption.id,
                        targetOptionId: optionMergeTargetId,
                      })
                    }
                  >
                    <Trans>Preview merge</Trans>
                  </Button>
                </>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                disabled={optionStatus !== 'idle'}
                onClick={() =>
                  prepareSelectOptionChange({
                    kind: 'delete',
                    optionId: selectedOption.id,
                  })
                }
              >
                <Trans>Preview delete</Trans>
              </Button>
              {optionStatus === 'loading' ? (
                <span
                  className="flex items-center gap-1 text-muted-foreground text-xs"
                  role="status"
                >
                  <Loader2 className="size-3 animate-spin" />
                  {isPagePresentation ? (
                    <Trans>Inspecting all pages</Trans>
                  ) : (
                    <Trans>Inspecting all records</Trans>
                  )}
                </span>
              ) : null}
            </div>
            {optionPreview ? (
              <section
                className="space-y-2 rounded border bg-background p-3 text-sm"
                aria-label={`${selectedOptionTypeLabel} option impact preview`}
              >
                <div className="flex flex-wrap gap-2">
                  <Badge variant={optionPreview.preview.canApply ? 'gray' : 'warning'}>
                    {optionPreview.preview.canApply ? 'ready' : 'blocked'}
                  </Badge>
                  <span>
                    {optionPreview.preview.recordChanges.length}{' '}
                    {isPagePresentation ? 'pages' : 'records'} ·{' '}
                    {optionPreview.preview.affectedViewIds.length} views · default{' '}
                    {optionPreview.preview.defaultChanged ? 'changes' : 'unchanged'}
                  </span>
                </div>
                {optionPreview.preview.conflicts.length > 0 ? (
                  <ul className="list-disc pl-5 text-destructive" role="alert">
                    {optionPreview.preview.conflicts.map((conflict) => (
                      <li key={conflict.code}>{conflict.message}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setOptionPreview(null)}>
                    <Trans>Discard preview</Trans>
                  </Button>
                  <Button
                    size="sm"
                    disabled={!optionPreview.desiredState || mutationStatus !== 'idle'}
                    onClick={planSelectOptionChange}
                  >
                    <Trans>Plan exact option change</Trans>
                  </Button>
                </div>
              </section>
            ) : null}
          </div>
        </details>
      ) : null}
      {importPreview ? (
        <section
          className="space-y-3 rounded-md border bg-muted/10 p-3"
          aria-label="Database import preview"
        >
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm">{importPreview.filename}</strong>
            <Badge variant="gray">{importPreview.inspection.encoding}</Badge>
            <Badge variant="gray">{importPreview.inspection.delimiterLabel}</Badge>
            <span className="text-muted-foreground text-xs">
              {importPreview.inspection.rowCount} rows · {importPreview.inspection.emptyValueCount}{' '}
              empty · {importPreview.inspection.dateValueCount} dates ·{' '}
              {importPreview.inspection.optionValueCount} options
            </span>
          </div>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Import header mappings</legend>
            {importPreview.inspection.mappings.map((mapping) => (
              <Badge key={mapping.propertyId} variant="gray">
                {mapping.header} → {mapping.propertyName} ({mapping.propertyType})
              </Badge>
            ))}
          </fieldset>
          {importPreview.inspection.preview.length > 0 ? (
            <div className="max-h-36 overflow-auto rounded border bg-background p-2 font-mono text-xs">
              {importPreview.inspection.preview.map((row) => (
                <div key={row.recordId} className="break-all">
                  {row.recordId}: {JSON.stringify(row.values)}
                </div>
              ))}
            </div>
          ) : null}
          {importPreview.inspection.issues.length > 0 ? (
            <div className="text-destructive text-sm" role="alert">
              <div className="font-medium">
                <Trans>Fix import values before planning</Trans>
              </div>
              <ul className="list-disc pl-5">
                {importPreview.inspection.issues.slice(0, 20).map((issue) => (
                  <li key={`${issue.row}:${issue.header}:${issue.message}`}>
                    Row {issue.row}, {issue.header}: {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setImportPreview(null)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              size="sm"
              disabled={
                importPreview.inspection.issues.length > 0 ||
                csvStatus !== 'idle' ||
                mutationStatus !== 'idle'
              }
              onClick={commitImportPreview}
            >
              <Trans>Plan import</Trans>
            </Button>
          </div>
        </section>
      ) : null}
      {moveRecord ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
          <span className="text-sm">
            {isPagePresentation ? (
              <Trans>Move selected page to</Trans>
            ) : (
              <Trans>Move selected record to</Trans>
            )}
          </span>
          <Select value={moveTargetSourceId} onValueChange={setMoveTargetSourceId}>
            <SelectTrigger size="sm" className="min-w-48" aria-label="Move target source">
              <SelectValue placeholder="Choose source" />
            </SelectTrigger>
            <SelectContent>
              {compatibleMoveTargets.map(({ source, mapping }: any) => (
                <SelectItem key={source.id} value={source.id}>
                  {source.name} · <Trans>{mapping.propertyMappings.length} mapped properties</Trans>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!moveTargetSourceId || mutationStatus !== 'idle'}
            onClick={planMove}
          >
            <Trans>Plan move</Trans>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMoveRecord(null)}>
            <Trans>Cancel</Trans>
          </Button>
        </div>
      ) : null}
      {selectedRecordIds.size > 0 ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-3"
          data-testid="database-bulk-toolbar"
        >
          <Badge variant="gray">
            <Trans>{selectedRecordIds.size} selected</Trans>
          </Badge>
          <Button variant="outline" size="sm" onClick={copySelectedRecords}>
            <Copy /> <Trans>Copy TSV</Trans>
          </Button>
          <Select
            value={bulkPropertyId}
            onValueChange={(propertyId) => {
              const property = description.source?.properties.find(
                (candidate) => candidate.id === propertyId,
              );
              setBulkPropertyId(propertyId);
              setBulkDraft(property ? initialCellDraft(property) : '');
            }}
          >
            <SelectTrigger size="sm" className="min-w-44" aria-label="Bulk property">
              <SelectValue placeholder="Choose property" />
            </SelectTrigger>
            <SelectContent>
              {description.source.properties.filter(isDatabaseCellEditable).map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {bulkProperty?.type === 'checkbox' ? (
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={bulkDraft === 'true'}
                aria-label={`Bulk value for ${bulkProperty.name}`}
                onCheckedChange={(checked) => setBulkDraft(checked === true ? 'true' : 'false')}
              />
              {bulkProperty.name}
            </div>
          ) : bulkProperty?.type === 'select' || bulkProperty?.type === 'status' ? (
            <Select value={bulkDraft} onValueChange={setBulkDraft}>
              <SelectTrigger size="sm" className="min-w-40" aria-label="Bulk value">
                <SelectValue placeholder="Choose value" />
              </SelectTrigger>
              <SelectContent>
                {bulkProperty.options
                  .filter((option: any) => option.archived !== true)
                  .map((option: any) => (
                    <SelectItem key={option.id} value={option.id}>
                      {bulkProperty.type === 'status' && 'groupId' in option
                        ? `${
                            bulkProperty.groups.find((group: any) => group.id === option.groupId)
                              ?.name ?? 'Status'
                          } · ${option.name}`
                        : option.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : bulkProperty?.type === 'multi_select' ? (
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">Bulk values</legend>
              {bulkProperty.options.map((option: any) => {
                const selected = multiSelectDraftValues(bulkDraft);
                return (
                  <div key={option.id} className="flex items-center gap-1 text-xs">
                    <Checkbox
                      checked={selected.includes(option.id)}
                      aria-label={`${option.name} bulk value`}
                      onCheckedChange={(checked) => {
                        const next = new Set(selected);
                        if (checked === true) next.add(option.id);
                        else next.delete(option.id);
                        setBulkDraft(JSON.stringify([...next]));
                      }}
                    />
                    {option.name}
                  </div>
                );
              })}
            </fieldset>
          ) : bulkProperty?.type === 'person' ? (
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">Bulk people</legend>
              {description.database.people
                .filter((person) => person.active)
                .map((person) => {
                  const selected = multiSelectDraftValues(bulkDraft);
                  return (
                    <div key={person.id} className="flex items-center gap-1 text-xs">
                      <Checkbox
                        checked={selected.includes(person.id)}
                        aria-label={`${person.name} bulk person`}
                        onCheckedChange={(checked) => {
                          const next = new Set(selected);
                          if (checked === true) {
                            if (!bulkProperty.multiple) next.clear();
                            next.add(person.id);
                          } else {
                            next.delete(person.id);
                          }
                          setBulkDraft(JSON.stringify([...next]));
                        }}
                      />
                      {person.name}
                      {person.kind === 'agent' ? ` (${personLabels.agent})` : ''}
                    </div>
                  );
                })}
            </fieldset>
          ) : bulkProperty?.type === 'files' ? (
            <DatabaseFilesCellEditor
              draft={bulkDraft}
              propertyName={bulkProperty.name}
              parentDocName={
                result.records.find((record) => selectedRecordIds.has(record.id))?.path ??
                `${description.source.folder}/database-record.md`
              }
              fileStates={result.fileStates}
              onDraftChange={setBulkDraft}
            />
          ) : bulkProperty?.type === 'relation' ? (
            <DatabaseRelationCellEditor
              property={bulkProperty}
              draft={bulkDraft}
              knownRecords={[
                ...new Map(
                  [...relationCandidates, ...(result.relationRecords ?? [])].map((record) => [
                    record.id,
                    record,
                  ]),
                ).values(),
              ]}
              searchRecords={(query) => searchRelationCandidates(bulkProperty, query)}
              onDraftChange={setBulkDraft}
            />
          ) : bulkProperty ? (
            <Input
              value={bulkDraft}
              type={bulkProperty.type === 'number' ? 'number' : 'text'}
              aria-label="Bulk value"
              className="h-8 min-w-48 flex-1"
              onChange={(event) => setBulkDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') planBulkEdit();
              }}
            />
          ) : null}
          <Button
            size="sm"
            disabled={!bulkProperty || mutationStatus !== 'idle'}
            onClick={planBulkEdit}
          >
            <Trans>Plan bulk edit</Trans>
          </Button>
          {bulkProperty?.type === 'checkbox' ? (
            <Button
              variant="outline"
              size="sm"
              disabled={mutationStatus !== 'idle'}
              onClick={planBulkCheckboxToggle}
            >
              <Trans>Toggle selected</Trans>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={mutationStatus !== 'idle'}
            onClick={() => setSelectedRecordIds(new Set())}
          >
            <Trans>Clear selection</Trans>
          </Button>
        </div>
      ) : null}
    </>
  );
}

import {
  createDatabaseDocumentId,
  createDatabaseMarkdownRecordId,
  DatabaseDefinitionSchema,
  type DatabaseDocumentId,
  type DatabaseProperty,
  databaseRecordPageLayoutOverrideIssues,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseDraftArtifact, DatabaseTargetResolution } from './database-plan-artifacts.ts';
import {
  cloneDatabasePlanValue as clone,
  compactDatabasePlanUuid as compactUuid,
  sameDatabasePlanValue as same,
} from './database-plan-convergence-policy.ts';
import type { DatabaseDesiredStateDraft } from './database-plan-draft-contracts.ts';
import {
  applyDatabaseRecordMutation as applyRecordMutation,
  normalizeDatabaseSampleValue as normalizeSampleValue,
  reconcileDatabasePairedRelationSamples as reconcilePairedRelationSamples,
} from './database-plan-normalization-policy.ts';
import type { DatabaseRecordIndex } from './database-record-index.ts';

export function normalizeDatabasePlanRecords(input: {
  desiredState: DatabaseDesiredStateDraft;
  definition: DatabaseDraftArtifact['normalized']['definition'];
  uniquePropertyId: string | null;
  currentDefinition: DatabaseDraftArtifact['normalized']['definition'] | null;
  targetResolutions: DatabaseTargetResolution[];
  databaseId: string;
  databaseRecordIndex?: DatabaseRecordIndex;
  generateUuid: () => string;
  now: () => Date;
}): Omit<DatabaseDraftArtifact['normalized'], 'definition' | 'uniquePropertyId'> {
  const { desiredState, currentDefinition, databaseId } = input;
  let definition = input.definition;
  const uniquePropertyId = input.uniquePropertyId;
  const targetResolutions = input.targetResolutions;
  const explicitSampleRecords = desiredState.sampleRecords.map((sample, sampleIndex) => {
    const source = definition.sources.find((candidate) => candidate.key === sample.sourceKey);
    if (!source) throw new Error(`Sample record has unknown source key "${sample.sourceKey}"`);
    const values: Record<string, unknown> = {};
    for (const [propertyKey, value] of Object.entries(sample.values)) {
      const property = source.properties.find((candidate) => candidate.key === propertyKey);
      if (!property) throw new Error(`Sample record has unknown property key "${propertyKey}"`);
      try {
        const normalizedValue = normalizeSampleValue(property, value, definition.people);
        values[property.id] = normalizedValue;
        if (property.type === 'select' || property.type === 'status') {
          const option = property.options.find((candidate) => candidate.id === normalizedValue);
          if (option) {
            targetResolutions.push({
              kind: 'option',
              selector: `sampleRecords.${sampleIndex}.values.${propertyKey}`,
              targetId: option.id,
              via:
                value === option.id
                  ? 'explicit_id'
                  : value === option.key
                    ? 'stable_key'
                    : 'exact_name',
            });
          }
        } else if (property.type === 'multi_select' && Array.isArray(normalizedValue)) {
          normalizedValue.forEach((optionId, optionIndex) => {
            const option = property.options.find((candidate) => candidate.id === optionId);
            const input = Array.isArray(value) ? value[optionIndex] : undefined;
            if (!option) return;
            targetResolutions.push({
              kind: 'option',
              selector: `sampleRecords.${sampleIndex}.values.${propertyKey}.${optionIndex}`,
              targetId: option.id,
              via:
                input === option.id
                  ? 'explicit_id'
                  : input === option.key
                    ? 'stable_key'
                    : 'exact_name',
            });
          });
        } else if (property.type === 'person' && Array.isArray(normalizedValue)) {
          normalizedValue.forEach((personId, personIndex) => {
            const person = definition.people.find((candidate) => candidate.id === personId);
            const input = Array.isArray(value) ? value[personIndex] : undefined;
            if (!person) return;
            targetResolutions.push({
              kind: 'person',
              selector: `sampleRecords.${sampleIndex}.values.${propertyKey}.${personIndex}`,
              targetId: person.id,
              via:
                input === person.id
                  ? 'explicit_id'
                  : input === person.key
                    ? 'stable_key'
                    : 'exact_name',
            });
          });
        } else if (property.type === 'relation') {
          const recordIds = Array.isArray(normalizedValue)
            ? normalizedValue.map(String)
            : [String(normalizedValue)];
          recordIds.forEach((recordId, relationIndex) => {
            targetResolutions.push({
              kind: 'record',
              selector: `sampleRecords.${sampleIndex}.values.${propertyKey}.${relationIndex}`,
              targetId: recordId,
              via: 'explicit_id',
            });
          });
        }
      } catch (error) {
        throw new Error(
          `Sample property "${propertyKey}" is invalid: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    for (const property of source.properties) {
      if (values[property.id] === undefined && property.semantics.defaultValue !== undefined) {
        values[property.id] = normalizeSampleValue(
          property,
          structuredClone(property.semantics.defaultValue),
          definition.people,
        );
      }
    }
    let recordId = sample.id;
    let documentId = sample.documentId as DatabaseDocumentId | undefined;
    let expectedRevision = sample.expectedRevision ?? null;
    let resolutionVia: DatabaseTargetResolution['via'] = sample.id ? 'explicit_id' : 'generated';
    if (!recordId && uniquePropertyId && values[uniquePropertyId] !== undefined) {
      const matches = (input.databaseRecordIndex?.list(databaseId, source.id) ?? []).filter(
        (record) => same(record.values[uniquePropertyId], values[uniquePropertyId]),
      );
      if (matches.length > 1) {
        throw new Error(
          `Sample record unique key resolves ambiguously to ${matches.length} records`,
        );
      }
      const match = matches[0];
      if (match) {
        if (!match.revision) throw new Error(`Record "${match.id}" has no stable revision`);
        recordId = match.id;
        expectedRevision ??= match.revision;
        resolutionVia = 'unique_property';
      }
    }
    if (source.storage?.kind === 'markdown_table' && !recordId) {
      documentId ??= createDatabaseDocumentId(input.generateUuid);
      recordId = createDatabaseMarkdownRecordId(source.id, documentId);
    }
    recordId ??= `rec_${compactUuid(input.generateUuid)}`;
    if (source.storage?.kind === 'markdown_table' && documentId) {
      const canonicalRecordId = createDatabaseMarkdownRecordId(source.id, documentId);
      if (recordId !== canonicalRecordId) {
        throw new Error(
          `V2 sample record "${recordId}" does not match document identity "${documentId}" for source "${source.id}"`,
        );
      }
    }
    if (sample.pageLayoutOverride) {
      const layoutIssues = databaseRecordPageLayoutOverrideIssues(
        source,
        sample.pageLayoutOverride,
      );
      if (layoutIssues.length > 0) {
        throw new Error(
          `Sample record page layout override is invalid: ${layoutIssues.join('; ')}`,
        );
      }
    }
    targetResolutions.push({
      kind: 'record',
      selector: sample.id
        ? `sampleRecords.${sampleIndex}.id`
        : resolutionVia === 'unique_property'
          ? `sampleRecords.${sampleIndex}.uniqueKey`
          : `sampleRecords.${sampleIndex}`,
      targetId: recordId,
      via: resolutionVia,
    });
    return {
      id: recordId,
      sourceId: source.id,
      values,
      body: sample.body,
      expectedRevision,
      ...(documentId ? { documentId } : {}),
      ...(sample.pageLayoutOverride !== undefined
        ? {
            pageLayoutOverride: sample.pageLayoutOverride
              ? structuredClone(sample.pageLayoutOverride)
              : null,
          }
        : {}),
    };
  });
  const explicitSampleIds = new Set(explicitSampleRecords.map((record) => record.id));
  const uniqueIdBackfillRecords = definition.sources.flatMap((source) => {
    const currentSource = currentDefinition?.sources.find(
      (candidate) => candidate.id === source.id,
    );
    const addsUniqueId = source.properties.some(
      (property) =>
        property.type === 'unique_id' &&
        currentSource?.properties.find((candidate) => candidate.id === property.id)?.type !==
          'unique_id',
    );
    if (!addsUniqueId) return [];
    return (input.databaseRecordIndex?.list(databaseId, source.id) ?? [])
      .filter((record) => !explicitSampleIds.has(record.id))
      .map((record) => {
        if (!record.revision) {
          throw new Error(`Unique ID backfill record "${record.id}" has no stable revision`);
        }
        return {
          id: record.id,
          sourceId: source.id,
          values: structuredClone(record.values) as Record<string, unknown>,
          body: record.body,
          expectedRevision: record.revision,
          archivedAt: record.archivedAt ?? null,
          ...(record.pageLayoutOverride
            ? { pageLayoutOverride: structuredClone(record.pageLayoutOverride) }
            : {}),
        };
      });
  });
  const recordCopies = desiredState.recordCopies.map((copy, copyIndex) => {
    const source = definition.sources.find((candidate) => candidate.key === copy.sourceKey);
    if (!source) throw new Error(`Record copy has unknown source key "${copy.sourceKey}"`);
    const sourceRecord = input.databaseRecordIndex?.getById(copy.id) ?? null;
    if (!sourceRecord) throw new Error(`Record copy source "${copy.id}" was not found`);
    if (sourceRecord.databaseId !== databaseId || sourceRecord.sourceId !== source.id) {
      throw new Error('Record copy source belongs to a different database or source');
    }
    if (!sourceRecord.revision) throw new Error(`Record copy source "${copy.id}" has no revision`);
    const titleProperty = source.properties.find((property) => property.type === 'title');
    if (!titleProperty) throw new Error(`Record copy source "${source.key}" has no title property`);
    const newRecordId = copy.newId ?? `rec_${compactUuid(input.generateUuid)}`;
    if (newRecordId === sourceRecord.id) throw new Error('A record copy must use a new stable ID');
    targetResolutions.push({
      kind: 'record',
      selector: `recordCopies.${copyIndex}.id`,
      targetId: sourceRecord.id,
      via: 'explicit_id',
    });
    targetResolutions.push({
      kind: 'record',
      selector: copy.newId ? `recordCopies.${copyIndex}.newId` : `recordCopies.${copyIndex}`,
      targetId: newRecordId,
      via: copy.newId ? 'explicit_id' : 'generated',
    });
    return {
      sourceRecordId: sourceRecord.id,
      expectedRevision: copy.expectedRevision,
      sourcePath: sourceRecord.path,
      newRecordId,
      sample: {
        id: newRecordId,
        sourceId: source.id,
        values: { ...sourceRecord.values, [titleProperty.id]: copy.title },
        body: sourceRecord.body,
        expectedRevision: null,
        ...(sourceRecord.pageLayoutOverride
          ? { pageLayoutOverride: structuredClone(sourceRecord.pageLayoutOverride) }
          : {}),
      },
    };
  });
  const archiveTimestamp = input.now().toISOString();
  const recordArchives = desiredState.recordArchives.map((archive, archiveIndex) => {
    const source = definition.sources.find((candidate) => candidate.key === archive.sourceKey);
    if (!source) throw new Error(`Record archive has unknown source key "${archive.sourceKey}"`);
    const record = input.databaseRecordIndex?.getById(archive.id) ?? null;
    if (!record) throw new Error(`Record archive target "${archive.id}" was not found`);
    if (record.databaseId !== databaseId || record.sourceId !== source.id) {
      throw new Error('Record archive target belongs to a different database or source');
    }
    if (!record.revision) throw new Error(`Record archive target "${archive.id}" has no revision`);
    const archivedAt =
      archive.action === 'archive' ? (record.archivedAt ?? archiveTimestamp) : null;
    targetResolutions.push({
      kind: 'record',
      selector: `recordArchives.${archiveIndex}.id`,
      targetId: record.id,
      via: 'explicit_id',
    });
    return {
      recordId: record.id,
      action: archive.action,
      archivedAt,
      sample: {
        id: record.id,
        sourceId: source.id,
        values: record.values,
        body: record.body,
        expectedRevision: archive.expectedRevision,
        archivedAt,
        ...(record.pageLayoutOverride
          ? { pageLayoutOverride: structuredClone(record.pageLayoutOverride) }
          : {}),
      },
    };
  });
  const recordMoves = desiredState.recordMoves.map((move, moveIndex) => {
    const source = definition.sources.find((candidate) => candidate.key === move.sourceKey);
    const target = definition.sources.find((candidate) => candidate.key === move.targetSourceKey);
    if (!source || !target) throw new Error('Record move references an unknown source key');
    if (source.id === target.id) throw new Error('Record move target must be a different source');
    const record = input.databaseRecordIndex?.getById(move.id) ?? null;
    if (!record) throw new Error(`Record move target "${move.id}" was not found`);
    if (record.databaseId !== databaseId || record.sourceId !== source.id) {
      throw new Error('Record move target belongs to a different database or source');
    }
    if (!record.revision) throw new Error(`Record move target "${move.id}" has no revision`);
    const sourceMapping = (definition.sourceMappings ?? []).find(
      (mapping) => mapping.sourceId === source.id && mapping.targetSourceId === target.id,
    );
    if (!sourceMapping) {
      throw new Error(
        `Record move requires an explicit source mapping from "${source.key}" to "${target.key}"`,
      );
    }
    const values: Record<string, unknown> = {};
    for (const targetProperty of target.properties) {
      const propertyMapping = sourceMapping.propertyMappings.find(
        (mapping) => mapping.targetPropertyId === targetProperty.id,
      );
      const sourceProperty = source.properties.find(
        (property) => property.id === propertyMapping?.sourcePropertyId,
      );
      const sourceValue = sourceProperty ? record.values[sourceProperty.id] : undefined;
      if (sourceValue === undefined) {
        if (targetProperty.required) {
          throw new Error(
            `Record move cannot satisfy required target property "${targetProperty.key}"`,
          );
        }
        continue;
      }
      if (
        (sourceProperty?.type === 'select' || sourceProperty?.type === 'status') &&
        targetProperty.type === sourceProperty.type &&
        typeof sourceValue === 'string'
      ) {
        const explicitTargetOptionId = propertyMapping?.optionMappings.find(
          (mapping) => mapping.sourceOptionId === sourceValue,
        )?.targetOptionId;
        const optionKey = sourceProperty.options.find((option) => option.id === sourceValue)?.key;
        const targetOption = targetProperty.options.find(
          (option) =>
            option.id === explicitTargetOptionId ||
            (explicitTargetOptionId === undefined && option.key === optionKey),
        );
        if (!targetOption) {
          throw new Error(
            `Record move cannot map select option for target property "${targetProperty.key}"`,
          );
        }
        values[targetProperty.id] = targetOption.id;
      } else if (
        sourceProperty?.type === 'multi_select' &&
        targetProperty.type === 'multi_select' &&
        Array.isArray(sourceValue)
      ) {
        values[targetProperty.id] = sourceValue.map((sourceOptionId) => {
          const explicitTargetOptionId = propertyMapping?.optionMappings.find(
            (mapping) => mapping.sourceOptionId === sourceOptionId,
          )?.targetOptionId;
          const optionKey = sourceProperty.options.find(
            (option) => option.id === sourceOptionId,
          )?.key;
          const targetOption = targetProperty.options.find(
            (option) =>
              option.id === explicitTargetOptionId ||
              (explicitTargetOptionId === undefined && option.key === optionKey),
          );
          if (!targetOption) {
            throw new Error(
              `Record move cannot map multi-select option for target property "${targetProperty.key}"`,
            );
          }
          return targetOption.id;
        });
      } else {
        values[targetProperty.id] = sourceValue;
      }
    }
    const targetPath = `${target.folder === '.' ? '' : `${target.folder}/`}${record.id}.md`;
    targetResolutions.push({
      kind: 'record',
      selector: `recordMoves.${moveIndex}.id`,
      targetId: record.id,
      via: 'explicit_id',
    });
    return {
      recordId: record.id,
      expectedRevision: move.expectedRevision,
      sourceId: source.id,
      targetSourceId: target.id,
      sourcePath: record.path,
      targetPath,
      values,
      body: record.body,
      archivedAt: record.archivedAt ?? null,
      pageLayoutOverride: null,
    };
  });
  const sampleRecords = [
    ...explicitSampleRecords,
    ...uniqueIdBackfillRecords,
    ...recordCopies.map((copy) => copy.sample),
    ...recordArchives.map((archive) => archive.sample),
  ];
  const recordMutations = desiredState.recordMutations.map((mutation, mutationIndex) => {
    const source = definition.sources.find((candidate) => candidate.key === mutation.sourceKey);
    if (!source) {
      throw new Error(`Record mutation has unknown source key "${mutation.sourceKey}"`);
    }
    let record = mutation.id ? input.databaseRecordIndex?.getById(mutation.id) : null;
    const via: DatabaseTargetResolution['via'] = mutation.id ? 'explicit_id' : 'unique_property';
    if (!mutation.id) {
      if (!uniquePropertyId) {
        throw new Error('A uniqueValue mutation target requires a declared unique key');
      }
      const uniqueProperty = source.properties.find((property) => property.id === uniquePropertyId);
      if (!uniqueProperty) {
        throw new Error('The declared unique key does not belong to the mutation source');
      }
      const uniqueValue = normalizeSampleValue(
        uniqueProperty,
        mutation.uniqueValue,
        definition.people,
        { allowInactivePeople: true },
      );
      const matches = (input.databaseRecordIndex?.list(databaseId, source.id) ?? []).filter(
        (candidate) => same(candidate.values[uniquePropertyId], uniqueValue),
      );
      if (matches.length !== 1) {
        throw new Error(
          `Record mutation unique key resolved to ${matches.length} records; expected exactly one`,
        );
      }
      record = matches[0] ?? null;
    }
    if (!record) throw new Error('Record mutation target was not found in the current index');
    if (record.databaseId !== databaseId || record.sourceId !== source.id) {
      throw new Error('Record mutation target belongs to a different database or source');
    }
    if (!record.revision) throw new Error(`Record mutation target "${record.id}" has no revision`);
    const applied = applyRecordMutation(source, definition.people, record, mutation);
    const requestedExpectedRevision = mutation.expectedRevision ?? record.revision;
    const preconditionsMatch =
      mutation.preconditions.length > 0 &&
      mutation.preconditions.every((precondition) => {
        const property = source.properties.find(
          (candidate) => candidate.key === precondition.propertyKey,
        );
        if (!property) return false;
        const present = Object.hasOwn(record.values, property.id);
        return (
          present === precondition.present &&
          (!present || same(record.values[property.id], precondition.value))
        );
      });
    const alreadyConverged = same(record.values, applied.values) && record.body === applied.body;
    const expectedRevision =
      requestedExpectedRevision === record.revision || preconditionsMatch || alreadyConverged
        ? record.revision
        : requestedExpectedRevision;
    targetResolutions.push({
      kind: 'record',
      selector: mutation.id
        ? `recordMutations.${mutationIndex}.id`
        : `recordMutations.${mutationIndex}.uniqueValue`,
      targetId: record.id,
      via,
    });
    for (const [operationIndex, operation] of applied.operations.entries()) {
      if (operation.kind === 'link' || operation.kind === 'unlink') {
        targetResolutions.push({
          kind: 'record',
          selector: `recordMutations.${mutationIndex}.operations.${operationIndex}.recordId`,
          targetId: operation.recordId,
          via: 'explicit_id',
        });
      } else if (
        (operation.kind === 'add' || operation.kind === 'remove') &&
        definition.people.some((person) => person.id === operation.value)
      ) {
        targetResolutions.push({
          kind: 'person',
          selector: `recordMutations.${mutationIndex}.operations.${operationIndex}.value`,
          targetId: operation.value,
          via: 'explicit_id',
        });
      }
    }
    return {
      recordId: record.id,
      sourceId: source.id,
      expectedRevision,
      values: applied.values,
      body: applied.body,
      operations: applied.operations,
      ...(record.pageLayoutOverride
        ? { pageLayoutOverride: structuredClone(record.pageLayoutOverride) }
        : {}),
    };
  });
  const recordDeletions = desiredState.recordDeletions.map((deletion, deletionIndex) => {
    const source = definition.sources.find((candidate) => candidate.key === deletion.sourceKey);
    if (!source) {
      throw new Error(`Record deletion has unknown source key "${deletion.sourceKey}"`);
    }
    const record = input.databaseRecordIndex?.getById(deletion.id) ?? null;
    if (!record) throw new Error(`Record deletion target "${deletion.id}" was not found`);
    if (record.databaseId !== databaseId || record.sourceId !== source.id) {
      throw new Error('Record deletion target belongs to a different database or source');
    }
    if (!record.revision) throw new Error(`Record deletion target "${record.id}" has no revision`);
    targetResolutions.push({
      kind: 'record',
      selector: `recordDeletions.${deletionIndex}.id`,
      targetId: record.id,
      via: 'explicit_id',
    });
    return {
      recordId: record.id,
      sourceId: source.id,
      expectedRevision: deletion.expectedRevision,
      path: record.path,
      values: record.values,
      body: record.body,
    };
  });
  for (const source of definition.sources) {
    const uniqueProperties = source.properties.filter(
      (property): property is Extract<DatabaseProperty, { type: 'unique_id' }> =>
        property.type === 'unique_id',
    );
    if (uniqueProperties.length === 0) continue;
    const indexedRecords = input.databaseRecordIndex?.list(databaseId, source.id) ?? [];
    for (const property of uniqueProperties) {
      const observed = indexedRecords
        .map((record) => record.values[property.id])
        .filter(
          (value): value is number =>
            typeof value === 'number' && Number.isSafeInteger(value) && value >= 1,
        );
      const used = new Set(observed);
      let nextNumber = Math.max(property.nextNumber, 1, ...observed.map((value) => value + 1));
      const allocate = (): number => {
        while (used.has(nextNumber)) nextNumber += 1;
        if (!Number.isSafeInteger(nextNumber)) {
          throw new Error(`Unique ID property "${property.key}" exhausted safe integers`);
        }
        const allocated = nextNumber;
        used.add(allocated);
        nextNumber += 1;
        return allocated;
      };
      for (const sample of sampleRecords.filter((record) => record.sourceId === source.id)) {
        const existing = input.databaseRecordIndex?.getById(sample.id);
        const currentValue =
          existing?.sourceId === source.id ? existing.values[property.id] : undefined;
        sample.values[property.id] =
          typeof currentValue === 'number' &&
          Number.isSafeInteger(currentValue) &&
          currentValue >= 1
            ? currentValue
            : allocate();
      }
      for (const move of recordMoves.filter((record) => record.targetSourceId === source.id)) {
        move.values[property.id] = allocate();
      }
      property.nextNumber = nextNumber;
    }
  }
  definition = DatabaseDefinitionSchema.parse(definition);
  const pairedRelations = reconcilePairedRelationSamples(
    definition,
    currentDefinition,
    [
      ...sampleRecords.map((sample) => ({
        ...sample,
        values: structuredClone(sample.values) as Record<string, unknown>,
      })),
      ...recordMutations.map((mutation) => ({
        id: mutation.recordId,
        sourceId: mutation.sourceId,
        values: structuredClone(mutation.values) as Record<string, unknown>,
        body: mutation.body,
        expectedRevision: mutation.expectedRevision,
        ...(mutation.pageLayoutOverride
          ? { pageLayoutOverride: structuredClone(mutation.pageLayoutOverride) }
          : {}),
      })),
    ],
    (recordId) => input.databaseRecordIndex?.getById(recordId) ?? null,
  );
  return {
    templates: clone(desiredState.templates),
    policy: clone(desiredState.policy),
    sampleRecords: pairedRelations.samples,
    recordMutations: [
      ...recordMutations.map((mutation) => ({
        recordId: mutation.recordId,
        sourceId: mutation.sourceId,
        operations: mutation.operations,
      })),
      ...pairedRelations.inverseMutations,
    ],
    recordCopies: recordCopies.map(({ sample: _sample, ...copy }) => copy),
    recordArchives: recordArchives.map(({ sample: _sample, ...archive }) => archive),
    recordMoves,
    recordDeletions,
    targetResolutions,
  };
}

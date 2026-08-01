import { createHash } from 'node:crypto';
import {
  type DatabaseAccessPrincipal,
  type DatabaseDefinition,
  type DatabaseFilter,
  type DatabasePermissionAction,
  type DatabasePublicSharePolicy,
  DatabasePublicSharePolicySchema,
  type DatabasePublicShareTarget,
  type DatabaseQuery,
  type DatabaseRecord,
  type DatabaseSource,
  type DatabaseView,
  databasePublicShareIsActive,
} from '@nedian0brien/synapsenote-core';
import { DatabaseDataPlaneError } from './database-data-plane-errors.ts';

export interface DatabasePublicShareTargetResolution {
  databaseId: string;
  sourceId: string;
  viewId: string | null;
  recordId: string | null;
}

export interface DatabasePublicShareAccessDecision {
  allowed?: boolean;
  policyId: string;
  policyRevision: string;
  allowedRecordIds: readonly string[] | null;
  allowedPropertyIds: readonly string[] | null;
  allowBody?: boolean;
}

export interface DatabasePublicShareAccessInput {
  action: DatabasePermissionAction;
  database: DatabaseDefinition;
  source: DatabaseSource;
  query: DatabaseQuery;
  view: DatabaseView | null;
  principal: DatabaseAccessPrincipal;
}

interface PublicSharePort {
  now(): Date;
  runPublicShare<T>(policy: DatabasePublicSharePolicy, operation: () => T): T;
  withAccessPrincipal<T>(principal: DatabaseAccessPrincipal, operation: () => T): T;
  authorizeOperation(input: { action: DatabasePermissionAction; databaseId?: string }): void;
  snapshot(): { databases: readonly DatabaseDefinition[] };
  getRecordById(recordId: string): DatabaseRecord | null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function filterPropertyIds(filter: DatabaseFilter | undefined): string[] {
  if (!filter) return [];
  if ('and' in filter) return filter.and.flatMap(filterPropertyIds);
  if ('or' in filter) return filter.or.flatMap(filterPropertyIds);
  if ('not' in filter) return filterPropertyIds(filter.not);
  return [filter.propertyId];
}

function conditionalColorPropertyIds(view: DatabaseView | null): string[] {
  return (view?.conditionalColors ?? []).flatMap((rule) => [
    ...filterPropertyIds(rule.where),
    ...(rule.applyTo.type === 'property' ? [rule.applyTo.propertyId] : []),
  ]);
}

function layoutPropertyIds(view: DatabaseView | null): string[] {
  if (!view) return [];
  if (view.layout.type === 'board' && view.layout.configuration.cardPreview.type === 'files') {
    return [view.layout.configuration.cardPreview.propertyId];
  }
  if (view.layout.type === 'timeline') {
    const mapping = view.layout.configuration.dateMapping;
    return [
      ...(mapping.type === 'range'
        ? [mapping.propertyId]
        : [mapping.startPropertyId, mapping.endPropertyId]),
      ...(view.layout.configuration.dependencyPropertyId
        ? [view.layout.configuration.dependencyPropertyId]
        : []),
    ];
  }
  if (view.layout.type === 'calendar') return [view.layout.configuration.datePropertyId];
  if (
    view.layout.type === 'list' &&
    view.layout.configuration.hierarchy.type === 'parent_relation'
  ) {
    return [view.layout.configuration.hierarchy.propertyId];
  }
  if (view.layout.type === 'gallery' && view.layout.configuration.cardPreview.type === 'files') {
    return [view.layout.configuration.cardPreview.propertyId];
  }
  if (view.layout.type === 'chart') {
    return [
      ...(view.layout.configuration.dimension
        ? [view.layout.configuration.dimension.propertyId]
        : []),
      ...(view.layout.configuration.seriesPropertyId
        ? [view.layout.configuration.seriesPropertyId]
        : []),
      ...(view.layout.configuration.measure.type === 'property'
        ? [view.layout.configuration.measure.propertyId]
        : []),
    ];
  }
  if (view.layout.type === 'map') return [view.layout.configuration.placePropertyId];
  if (view.layout.type === 'feed') {
    return [
      view.layout.configuration.chronologyPropertyId,
      ...(view.layout.configuration.authorPropertyId
        ? [view.layout.configuration.authorPropertyId]
        : []),
    ];
  }
  return [];
}

function viewReferencedPropertyIds(view: DatabaseView): string[] {
  const formQuestionPropertyIds =
    view.layout.type === 'form'
      ? (() => {
          const questions = view.layout.configuration.questions;
          return questions.flatMap((question) => [
            question.propertyId,
            ...(question.visibleWhen?.conditions.flatMap(({ questionId }) => {
              const dependency = questions.find(({ id }) => id === questionId);
              return dependency ? [dependency.propertyId] : [];
            }) ?? []),
          ]);
        })()
      : [];
  return [
    ...filterPropertyIds(view.where),
    ...view.sort.map(({ propertyId }) => propertyId),
    ...view.groups.map(({ propertyId }) => propertyId),
    ...view.projection.propertyIds,
    ...conditionalColorPropertyIds(view),
    ...layoutPropertyIds(view),
    ...formQuestionPropertyIds,
  ];
}

export function createDatabasePublicSharePolicy(port: PublicSharePort) {
  const resolveAccess = (
    policy: DatabasePublicSharePolicy,
    input: DatabasePublicShareAccessInput,
  ): DatabasePublicShareAccessDecision => {
    const revision = `sha256:${createHash('sha256')
      .update(
        stableJson({
          id: policy.id,
          target: policy.target,
          access: policy.access,
          propertyIds: policy.propertyIds,
          allowBody: policy.allowBody,
          allowFormSubmission: policy.allowFormSubmission,
          expiresAt: policy.expiresAt,
          revokedAt: policy.revokedAt,
          tokenHash: policy.tokenHash,
          updatedAt: policy.updatedAt,
        }),
      )
      .digest('hex')}`;
    const denied = (): DatabasePublicShareAccessDecision => ({
      allowed: false,
      policyId: policy.id,
      policyRevision: revision,
      allowedRecordIds: [],
      allowedPropertyIds: [],
      allowBody: false,
    });
    const readableActions = new Set<DatabasePermissionAction>([
      'catalog',
      'describe',
      'read_record',
      'search',
      'query',
      'aggregate',
      'expand_relation',
      'pack_context',
    ]);
    const target = policy.target;
    if (!readableActions.has(input.action) || input.database.id !== target.databaseId) {
      return denied();
    }
    let sourceId: string | null = null;
    let allowedRecordIds: readonly string[] | null = null;
    if (target.kind === 'database') {
      sourceId = target.sourceId;
    } else if (target.kind === 'record') {
      const record = port.getRecordById(target.recordId);
      if (!record || record.databaseId !== target.databaseId) return denied();
      sourceId = record.sourceId;
      allowedRecordIds = [record.id];
    } else {
      const targetView = input.database.views.find(({ id }) => id === target.viewId);
      if (!targetView) return denied();
      sourceId = targetView.sourceId;
      const operationNeedsView =
        target.kind !== 'form' &&
        (input.action === 'query' ||
          input.action === 'aggregate' ||
          input.action === 'pack_context');
      if (operationNeedsView && input.view?.id !== targetView.id) return denied();
      if (input.view && input.view.id !== targetView.id) return denied();
    }
    if (input.source.id !== sourceId) return denied();
    const knownPropertyIds = new Set(input.source.properties.map(({ id }) => id));
    const allowedPropertyIds = policy.propertyIds.filter((id) => knownPropertyIds.has(id));
    if (
      !input.source.properties.some(
        ({ id, type }) => type === 'title' && allowedPropertyIds.includes(id),
      )
    ) {
      return denied();
    }
    return {
      allowed: true,
      policyId: policy.id,
      policyRevision: revision,
      allowedRecordIds,
      allowedPropertyIds,
      allowBody: policy.allowBody,
    };
  };

  return {
    withPublicShare<T>(policy: DatabasePublicSharePolicy, operation: () => T): T {
      const parsed = DatabasePublicSharePolicySchema.parse(policy);
      if (!databasePublicShareIsActive(parsed, port.now())) {
        throw new DatabaseDataPlaneError('permission_denied', 'Public share is unavailable');
      }
      return port.runPublicShare(parsed, () =>
        port.withAccessPrincipal({ kind: 'user', id: `share:${parsed.id}` }, operation),
      );
    },
    validateTarget(input: {
      target: DatabasePublicShareTarget;
      propertyIds: readonly string[];
      allowFormSubmission: boolean;
    }): DatabasePublicShareTargetResolution {
      const target = input.target;
      port.authorizeOperation({ action: 'publish', databaseId: target.databaseId });
      const database = port
        .snapshot()
        .databases.find((candidate) => candidate.id === target.databaseId);
      if (!database) {
        throw new DatabaseDataPlaneError('database_not_found', 'Database was not found');
      }
      let source: DatabaseSource | undefined;
      let view: DatabaseView | undefined;
      let record: DatabaseRecord | undefined;
      if (target.kind === 'database') {
        source = database.sources.find((candidate) => candidate.id === target.sourceId);
      } else if (target.kind === 'record') {
        record = port.getRecordById(target.recordId) ?? undefined;
        if (record?.databaseId === database.id) {
          source = database.sources.find((candidate) => candidate.id === record?.sourceId);
        }
      } else {
        view = database.views.find((candidate) => candidate.id === target.viewId);
        source = view
          ? database.sources.find((candidate) => candidate.id === view?.sourceId)
          : undefined;
        if (
          view &&
          ((target.kind === 'form' && view.layout.type !== 'form') ||
            (target.kind === 'chart' && view.layout.type !== 'chart') ||
            (target.kind === 'view' &&
              (view.layout.type === 'form' || view.layout.type === 'chart')))
        ) {
          throw new DatabaseDataPlaneError(
            'view_not_found',
            'Share target view type does not match',
          );
        }
      }
      if (!source) {
        throw new DatabaseDataPlaneError(
          target.kind === 'record'
            ? 'record_not_found'
            : target.kind === 'database'
              ? 'source_not_found'
              : 'view_not_found',
          'Public share target was not found',
        );
      }
      const knownPropertyIds = new Set(source.properties.map(({ id }) => id));
      const unknownPropertyIds = input.propertyIds.filter((id) => !knownPropertyIds.has(id));
      if (unknownPropertyIds.length > 0) {
        throw new DatabaseDataPlaneError(
          'property_not_found',
          'Public share references an unknown property',
          { propertyIds: unknownPropertyIds },
        );
      }
      const titleProperty = source.properties.find(({ type }) => type === 'title');
      if (!titleProperty || !input.propertyIds.includes(titleProperty.id)) {
        throw new DatabaseDataPlaneError(
          'permission_denied',
          'Public shares must include the source title property',
        );
      }
      if (view) {
        const hiddenViewPropertyIds = viewReferencedPropertyIds(view).filter(
          (propertyId) => !input.propertyIds.includes(propertyId),
        );
        if (hiddenViewPropertyIds.length > 0) {
          throw new DatabaseDataPlaneError(
            'permission_denied',
            'Public View shares must expose every property required by the View',
            { propertyIds: [...new Set(hiddenViewPropertyIds)].sort() },
          );
        }
      }
      if (input.allowFormSubmission) {
        if (target.kind !== 'form' || view?.layout.type !== 'form') {
          throw new DatabaseDataPlaneError(
            'form_access_denied',
            'Only a Form share may accept submissions',
          );
        }
        const submittedPropertyIds = view.layout.configuration.questions.map(
          ({ propertyId }) => propertyId,
        );
        const hiddenSubmissionPropertyIds = submittedPropertyIds.filter(
          (propertyId) => !input.propertyIds.includes(propertyId),
        );
        if (hiddenSubmissionPropertyIds.length > 0) {
          throw new DatabaseDataPlaneError(
            'form_access_denied',
            'Form shares must expose every submitted property',
            { propertyIds: hiddenSubmissionPropertyIds },
          );
        }
      }
      return {
        databaseId: database.id,
        sourceId: source.id,
        viewId: view?.id ?? null,
        recordId: record?.id ?? null,
      };
    },
    resolveAccess,
  };
}

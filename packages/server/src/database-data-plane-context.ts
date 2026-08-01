import type {
  DatabaseDefinition,
  DatabaseFilter,
  DatabaseView,
} from '@nedian0brien/synapsenote-core';
import type {
  DatabaseContextInspection,
  DatabaseContextInspectionScope,
  DatabaseContextInspectionSummary,
  DatabaseContextInspector,
} from './database-context-inspector.ts';
import {
  type DatabaseContextPack,
  DatabaseContextPackError,
  type DatabaseContextPackInput,
} from './database-context-pack.ts';
import type {
  AppliedDatabaseAgentView,
  DatabaseDataPlanePackInput,
} from './database-data-plane-contracts.ts';
import { DatabaseDataPlaneError } from './database-data-plane-errors.ts';
import type {
  DatabaseRecordIndex,
  DatabaseRecordIndexIssueCode,
  DatabaseRecordIndexStatus,
} from './database-record-index.ts';

interface ContextPackPort {
  snapshot(): { databases: readonly DatabaseDefinition[] };
  visibleViews(
    database: DatabaseDefinition,
    source: DatabaseDefinition['sources'][number],
    action: 'pack_context',
  ): DatabaseView[];
  appliedAgentView(view: DatabaseView): AppliedDatabaseAgentView;
  contextSensitivityPolicy(
    database: DatabaseDefinition,
    maxSensitivity: DatabaseDefinition['contract']['sensitivity'],
  ): NonNullable<DatabaseContextPackInput['sensitivityPolicy']>;
  filterPropertyIds(filter: DatabaseFilter | undefined): string[];
  combineFilters(
    saved: DatabaseFilter | undefined,
    requested: DatabaseFilter | undefined,
  ): DatabaseFilter | undefined;
  createContextPack(input: DatabaseContextPackInput): DatabaseContextPack;
  captureContextPack(pack: DatabaseContextPack): DatabaseContextPack;
  authorizeOperation(input: { action: 'read_audit' }): void;
  contextInspector: DatabaseContextInspector;
  recordIndex: Pick<DatabaseRecordIndex, 'status' | 'snapshot'>;
  databaseSchemaRevision(definition: DatabaseDefinition): string;
}

export function createDatabaseContextPackCoordinator(port: ContextPackPort) {
  return {
    pack(input: DatabaseDataPlanePackInput): DatabaseContextPack {
      const snapshot = port.snapshot();
      const database = snapshot.databases.find((candidate) => candidate.id === input.databaseId);
      if (!database) {
        throw new DatabaseDataPlaneError('database_not_found', 'Database was not found', {
          databaseId: input.databaseId,
        });
      }
      const source = database.sources.find((candidate) => candidate.id === input.sourceId);
      if (!source) {
        throw new DatabaseDataPlaneError('source_not_found', 'Data source was not found', {
          databaseId: input.databaseId,
          sourceId: input.sourceId,
        });
      }
      const visibleAgentViews = port
        .visibleViews(database, source, 'pack_context')
        .filter((candidate) => candidate.layout.type === 'agent' && candidate.agent);
      const view =
        input.agentViewId === undefined
          ? null
          : (visibleAgentViews.find((candidate) => candidate.id === input.agentViewId) ?? null);
      if (
        input.agentViewId !== undefined &&
        (!view || view.layout.type !== 'agent' || !view.agent)
      ) {
        throw new DatabaseDataPlaneError('agent_view_not_found', 'Agent View was not found', {
          agentViewId: input.agentViewId,
          candidates: visibleAgentViews.map((candidate) => ({
            id: candidate.id,
            key: candidate.key,
            name: candidate.name,
          })),
        });
      }
      if (view && view.sourceId !== source.id) {
        throw new DatabaseDataPlaneError(
          'agent_view_source_mismatch',
          'Agent View belongs to a different data source',
          {
            agentViewId: view.id,
            viewSourceId: view.sourceId,
            sourceId: source.id,
          },
        );
      }
      if (!view) {
        if (input.maxTokens === undefined || !input.tokenizer || !input.encoding) {
          throw new DatabaseContextPackError(
            'invalid_pack_budget',
            'A context pack without an Agent View requires maxTokens, tokenizer, and encoding',
          );
        }
        const { agentViewId: _agentViewId, ...plain } = input;
        return port.captureContextPack(
          port.createContextPack({
            ...plain,
            sensitivityPolicy: port.contextSensitivityPolicy(database, 'internal'),
            maxTokens: input.maxTokens,
            tokenizer: input.tokenizer,
            encoding: input.encoding,
          }),
        );
      }

      const agentContract = view.agent;
      if (!agentContract || view.layout.type !== 'agent') {
        throw new Error('validated Agent View is missing its typed contract');
      }
      const agentView = port.appliedAgentView(view);
      const sensitivityPolicy = port.contextSensitivityPolicy(
        database,
        agentContract.readPolicy.maxSensitivity,
      );
      const budget = agentContract.tokenBudget;
      if (
        agentContract.semanticContract.evidence === 'required' &&
        input.disclosure?.level !== 'evidence'
      ) {
        throw new DatabaseDataPlaneError(
          'agent_view_scope_violation',
          'Agent View requires evidence disclosure with an explicit search text',
          { agentViewId: view.id, requiredDisclosure: 'evidence' },
        );
      }
      if (input.disclosure?.level === 'full_body' && view.projection.body !== 'full') {
        throw new DatabaseDataPlaneError(
          'agent_view_scope_violation',
          'Agent View does not permit full-body disclosure',
          { agentViewId: view.id, allowedBodyDisclosure: view.projection.body },
        );
      }
      if (input.maxTokens !== undefined && input.maxTokens > budget.maxTokens) {
        throw new DatabaseDataPlaneError(
          'agent_view_budget_exceeded',
          'Requested token budget exceeds the Agent View maximum',
          {
            agentViewId: view.id,
            requestedMaxTokens: input.maxTokens,
            maxTokens: budget.maxTokens,
          },
        );
      }
      if (
        (input.tokenizer !== undefined && input.tokenizer !== budget.tokenizer) ||
        (input.encoding !== undefined && input.encoding !== budget.encoding)
      ) {
        throw new DatabaseDataPlaneError(
          'agent_view_scope_violation',
          'Tokenizer and encoding must match the saved Agent View contract',
          {
            agentViewId: view.id,
            tokenizer: budget.tokenizer,
            encoding: budget.encoding,
          },
        );
      }
      const projected = new Set(view.projection.propertyIds);
      const propertyIds = input.propertyIds ?? view.projection.propertyIds;
      const requestedDependencies = [
        ...propertyIds,
        ...port.filterPropertyIds(input.query?.where),
        ...(input.query?.sort ?? []).map((sort) => sort.propertyId),
      ];
      const outsideScope = [...new Set(requestedDependencies)].filter(
        (propertyId) => !projected.has(propertyId),
      );
      if (outsideScope.length > 0) {
        throw new DatabaseDataPlaneError(
          'agent_view_scope_violation',
          'Context pack references properties outside the Agent View projection',
          {
            agentViewId: view.id,
            deniedPropertyIds: outsideScope,
            allowedPropertyIds: [...projected],
          },
        );
      }
      const savedRelation = agentContract.scope;
      if (
        input.relationExpansion &&
        (savedRelation.relationDepth === 0 ||
          input.relationExpansion.maxDepth > savedRelation.relationDepth ||
          input.relationExpansion.maxRecords > savedRelation.relationMaxRecords ||
          input.relationExpansion.maxRecordsPerRelation > savedRelation.relationFanOut)
      ) {
        throw new DatabaseDataPlaneError(
          'agent_view_scope_violation',
          'Relation expansion exceeds the saved Agent View scope',
          {
            agentViewId: view.id,
            allowedRelationScope: {
              maxDepth: savedRelation.relationDepth,
              maxRecords: savedRelation.relationMaxRecords,
              maxRecordsPerRelation: savedRelation.relationFanOut,
            },
          },
        );
      }
      const relationExpansion =
        input.relationExpansion ??
        (savedRelation.relationDepth > 0
          ? {
              maxDepth: savedRelation.relationDepth,
              maxRecords: savedRelation.relationMaxRecords,
              maxRecordsPerRelation: savedRelation.relationFanOut,
            }
          : undefined);
      const reserveTokens = Math.max(
        input.reserveTokens ?? budget.reserveTokens,
        budget.reserveTokens,
      );
      const maxTokens = input.maxTokens ?? budget.maxTokens;
      if (reserveTokens >= maxTokens) {
        throw new DatabaseDataPlaneError(
          'agent_view_budget_exceeded',
          'Agent View reserve leaves no usable context budget',
          { agentViewId: view.id, maxTokens, reserveTokens },
        );
      }
      const { agentViewId: _agentViewId, ...requested } = input;
      return port.captureContextPack(
        port.createContextPack({
          ...requested,
          propertyIds: [...propertyIds],
          query: {
            where: port.combineFilters(view.where, input.query?.where),
            sort: input.query?.sort?.length ? input.query.sort : view.sort,
            select: [...propertyIds],
            includeArchived: input.query?.includeArchived ?? false,
          },
          maxTokens,
          reserveTokens,
          tokenizer: budget.tokenizer,
          encoding: budget.encoding,
          ...(relationExpansion ? { relationExpansion } : {}),
          agentView,
          recordLimit: agentContract.scope.maxRecords,
          includeBodyEvidence: view.projection.body !== 'hidden' && sensitivityPolicy.allowBody,
          sensitivityPolicy,
        }),
      );
    },

    listContextInspections(
      scope?: DatabaseContextInspectionScope,
    ): readonly DatabaseContextInspectionSummary[] {
      port.authorizeOperation({ action: 'read_audit' });
      return port.contextInspector.list(scope);
    },

    getContextInspection(
      packId: string,
      scope?: DatabaseContextInspectionScope,
    ): DatabaseContextInspection {
      port.authorizeOperation({ action: 'read_audit' });
      const inspection = port.contextInspector.get(packId, scope);
      if (!inspection) {
        throw new DatabaseDataPlaneError(
          'context_inspection_not_found',
          `Context inspection for pack "${packId}" was not found`,
          {
            packId,
            candidates: port.contextInspector.list(scope).map((candidate) => candidate.packId),
          },
        );
      }
      return inspection;
    },

    getRecordIndexStatus(): DatabaseRecordIndexStatus {
      port.authorizeOperation({ action: 'read_audit' });
      return port.recordIndex.status();
    },

    getRecordIndexIssuesSummary(): {
      total: number;
      byCode: Partial<Record<DatabaseRecordIndexIssueCode, number>>;
      sample: ReadonlyArray<{
        code: DatabaseRecordIndexIssueCode;
        path: string;
        databaseId?: string;
        sourceId?: string;
        recordId?: string;
      }>;
    } {
      port.authorizeOperation({ action: 'read_audit' });
      const issues = port.recordIndex.snapshot().issues;
      const byCode: Partial<Record<DatabaseRecordIndexIssueCode, number>> = {};
      for (const issue of issues) byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;
      return {
        total: issues.length,
        byCode,
        sample: issues.slice(0, 50).map((issue) => ({
          code: issue.code,
          path: issue.path,
          ...(issue.databaseId ? { databaseId: issue.databaseId } : {}),
          ...(issue.sourceId ? { sourceId: issue.sourceId } : {}),
          ...(issue.recordId ? { recordId: issue.recordId } : {}),
        })),
      };
    },

    getSchemaRevisions(): ReadonlyArray<{
      databaseId: string;
      key: string;
      name: string;
      schemaRevision: string;
    }> {
      port.authorizeOperation({ action: 'read_audit' });
      return port.snapshot().databases.map((database) => ({
        databaseId: database.id,
        key: database.key,
        name: database.name,
        schemaRevision: port.databaseSchemaRevision(database),
      }));
    },
  };
}

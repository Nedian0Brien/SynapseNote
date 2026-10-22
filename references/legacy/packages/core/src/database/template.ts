import type {
  DatabaseDefinition,
  DatabaseTemplate,
  DatabaseTemplateId,
  DatabaseViewId,
  DataSourceId,
} from './schema.ts';

export interface ResolveDatabaseTemplateInput {
  sourceId: DataSourceId;
  templateId?: DatabaseTemplateId;
  viewId?: DatabaseViewId;
  entryPoint?: string;
  skipTemplate?: boolean;
}

/** Resolve an explicit or scoped default template using deterministic precedence. */
export function resolveDatabaseTemplate(
  database: DatabaseDefinition,
  input: ResolveDatabaseTemplateInput,
): DatabaseTemplate | null {
  const available = database.templates.filter(
    (template) => template.sourceId === input.sourceId && template.archivedAt === null,
  );
  if (input.skipTemplate) return null;
  if (input.templateId) {
    return available.find((template) => template.id === input.templateId) ?? null;
  }
  const entryPoint = input.entryPoint;
  if (entryPoint) {
    const match = available.find((template) =>
      template.defaultFor.entryPoints.includes(entryPoint),
    );
    if (match) return match;
  }
  const viewId = input.viewId;
  if (viewId) {
    const match = available.find((template) => template.defaultFor.viewIds.includes(viewId));
    if (match) return match;
  }
  return available.find((template) => template.defaultFor.source) ?? null;
}

export interface ApplyDatabaseTemplateInput extends ResolveDatabaseTemplateInput {
  values?: Readonly<Record<string, unknown>>;
  body?: string;
}

export interface AppliedDatabaseTemplate {
  templateId: DatabaseTemplateId | null;
  values: Record<string, unknown>;
  body: string;
}

/** Materialize source defaults, then template defaults, then caller overrides. */
export function applyDatabaseTemplate(
  database: DatabaseDefinition,
  input: ApplyDatabaseTemplateInput,
): AppliedDatabaseTemplate {
  const source = database.sources.find((candidate) => candidate.id === input.sourceId);
  if (!source) throw new Error(`Database source "${input.sourceId}" is not defined`);
  const template = resolveDatabaseTemplate(database, input);
  if (input.templateId && !template) {
    throw new Error(
      `Active template "${input.templateId}" is not defined for source "${input.sourceId}"`,
    );
  }
  const propertyDefaults = Object.fromEntries(
    source.properties.flatMap((property) =>
      property.semantics?.defaultValue === undefined
        ? []
        : [[property.id, structuredClone(property.semantics.defaultValue)]],
    ),
  );
  return {
    templateId: template?.id ?? null,
    values: {
      ...propertyDefaults,
      ...(template ? structuredClone(template.propertyValues) : {}),
      ...(input.values ? structuredClone(input.values) : {}),
    },
    body: input.body ?? template?.body ?? '',
  };
}

export function orderedDatabaseTemplates(
  database: DatabaseDefinition,
  sourceId: DataSourceId,
  options: { includeArchived?: boolean } = {},
): DatabaseTemplate[] {
  return [...database.templates]
    .filter(
      (template) =>
        template.sourceId === sourceId && (options.includeArchived || template.archivedAt === null),
    )
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
}

import { createHash } from 'node:crypto';

export interface NotionExportProperty {
  id: string;
  name: string;
  type: string;
  options?: readonly { id: string; name: string; color?: string }[];
  targetDataSourceId?: string;
  formula?: { source: string; resultType?: string };
  rollup?: { relationPropertyId: string; targetPropertyId: string; function: string };
}

export interface NotionExportView {
  id: string;
  dataSourceId: string;
  name: string;
  type: string;
  propertyIds?: readonly string[];
  sort?: readonly { propertyId: string; direction: 'ascending' | 'descending' }[];
  filter?: unknown;
}

export interface NotionExportTemplate {
  id: string;
  dataSourceId: string;
  name: string;
  body: string;
  propertyValues?: Readonly<Record<string, unknown>>;
}

export interface NotionExportRecord {
  id: string;
  dataSourceId: string;
  propertyValues: Readonly<Record<string, unknown>>;
  body: string;
  assetPaths?: readonly string[];
}

export interface NotionExportDataSource {
  id: string;
  name: string;
  properties: readonly NotionExportProperty[];
  records: readonly NotionExportRecord[];
}

export interface NotionExportDatabase {
  id: string;
  name: string;
  description?: string;
  dataSources: readonly NotionExportDataSource[];
  views?: readonly NotionExportView[];
  templates?: readonly NotionExportTemplate[];
}

export interface NotionNormalizedExport {
  version: 1;
  databases: readonly NotionExportDatabase[];
  assets?: readonly { path: string; available: boolean }[];
}

export interface NotionImportIssue {
  code:
    | 'unsupported_property'
    | 'unsupported_view'
    | 'formula_requires_translation'
    | 'rollup_requires_review'
    | 'relation_target_missing'
    | 'view_filter_requires_review'
    | 'missing_asset'
    | 'duplicate_notion_id';
  severity: 'warning' | 'blocking';
  objectKind:
    | 'database'
    | 'data_source'
    | 'property'
    | 'option'
    | 'view'
    | 'template'
    | 'record'
    | 'asset';
  notionId: string;
  path: string;
  handling: 'preserved' | 'requires_review' | 'skipped';
  message: string;
}

export interface NotionImportPropertyDraft {
  id: string;
  notionId: string;
  key: string;
  name: string;
  type: string;
  options?: readonly { id: string; notionId: string; key: string; name: string; color?: string }[];
  targetSourceId?: string;
  formula?: NotionExportProperty['formula'];
  rollup?: { relationPropertyId: string; targetPropertyId: string; function: string };
  importState: 'ready' | 'requires_review' | 'unsupported';
}

export interface NotionImportPlan {
  version: 1;
  kind: 'notion-normalized-export';
  requiresConfirmation: true;
  complete: true;
  databases: readonly {
    id: string;
    notionId: string;
    key: string;
    name: string;
    description?: string;
    dataSources: readonly {
      id: string;
      notionId: string;
      key: string;
      name: string;
      properties: readonly NotionImportPropertyDraft[];
      records: readonly {
        id: string;
        notionId: string;
        values: Readonly<Record<string, unknown>>;
        body: string;
        assetPaths: readonly string[];
      }[];
    }[];
    views: readonly {
      id: string;
      notionId: string;
      sourceId: string;
      key: string;
      name: string;
      layout: string;
      propertyIds: readonly string[];
      sort: readonly { propertyId: string; direction: 'asc' | 'desc' }[];
      sourceFilter?: unknown;
      importState: 'ready' | 'requires_review' | 'unsupported';
    }[];
    templates: readonly {
      id: string;
      notionId: string;
      sourceId: string;
      key: string;
      name: string;
      body: string;
      propertyValues: Readonly<Record<string, unknown>>;
    }[];
  }[];
  issues: readonly NotionImportIssue[];
  idMap: Readonly<Record<string, string>>;
  summary: {
    databases: number;
    dataSources: number;
    properties: number;
    views: number;
    templates: number;
    records: number;
    unsupported: number;
    lossyOrReview: number;
    missingAssets: number;
  };
}

function key(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return /^[a-z]/.test(normalized) ? normalized.slice(0, 96) : `notion_${normalized || 'item'}`;
}

function stableId(prefix: string, notionId: string): string {
  const digest = createHash('sha256')
    .update(`notion:${prefix}:${notionId}`)
    .digest('hex')
    .slice(0, 24);
  return `${prefix}_${digest}`;
}

const PROPERTY_TYPE_MAP: Readonly<Record<string, string>> = {
  title: 'title',
  rich_text: 'text',
  text: 'text',
  number: 'number',
  checkbox: 'checkbox',
  date: 'date',
  select: 'select',
  status: 'status',
  multi_select: 'multi_select',
  url: 'url',
  email: 'email',
  phone_number: 'phone',
  files: 'files',
  people: 'person',
  created_time: 'created_time',
  last_edited_time: 'last_edited_time',
  created_by: 'created_by',
  last_edited_by: 'last_edited_by',
  unique_id: 'unique_id',
  relation: 'relation',
  formula: 'formula',
  rollup: 'rollup',
};

const VIEW_TYPE_MAP: Readonly<Record<string, string>> = {
  table: 'table',
  board: 'board',
  calendar: 'calendar',
  timeline: 'timeline',
  list: 'list',
  gallery: 'gallery',
};

/** Plans a faithful import from a normalized Notion export adapter without silently flattening. */
export function planNotionDatabaseImport(input: NotionNormalizedExport): NotionImportPlan {
  if (input.version !== 1) throw new Error('Unsupported normalized Notion export version');
  const issues: NotionImportIssue[] = [];
  const idMap: Record<string, string> = {};
  const seenIds = new Set<string>();
  const register = (
    kind: NotionImportIssue['objectKind'],
    notionId: string,
    mapped: string,
    path: string,
  ) => {
    if (seenIds.has(notionId)) {
      issues.push({
        code: 'duplicate_notion_id',
        severity: 'blocking',
        objectKind: kind,
        notionId,
        path,
        handling: 'skipped',
        message: `Notion ID "${notionId}" is duplicated in the export.`,
      });
    } else {
      seenIds.add(notionId);
      idMap[notionId] = mapped;
    }
  };
  for (const database of input.databases) {
    register('database', database.id, stableId('db', database.id), `databases/${database.id}`);
    for (const source of database.dataSources) {
      register(
        'data_source',
        source.id,
        stableId('ds', source.id),
        `databases/${database.id}/sources/${source.id}`,
      );
      for (const property of source.properties) {
        register(
          'property',
          property.id,
          stableId('prop', property.id),
          `databases/${database.id}/sources/${source.id}/properties/${property.id}`,
        );
        for (const option of property.options ?? []) {
          register(
            'option',
            option.id,
            stableId('opt', option.id),
            `databases/${database.id}/sources/${source.id}/properties/${property.id}/options/${option.id}`,
          );
        }
      }
      for (const record of source.records)
        register(
          'record',
          record.id,
          stableId('rec', record.id),
          `databases/${database.id}/sources/${source.id}/records/${record.id}`,
        );
    }
    for (const view of database.views ?? [])
      register(
        'view',
        view.id,
        stableId('view', view.id),
        `databases/${database.id}/views/${view.id}`,
      );
    for (const template of database.templates ?? [])
      register(
        'template',
        template.id,
        stableId('tpl', template.id),
        `databases/${database.id}/templates/${template.id}`,
      );
  }
  const availableAssets = new Map(
    (input.assets ?? []).map((asset) => [asset.path, asset.available]),
  );
  let propertyCount = 0;
  let recordCount = 0;
  let viewCount = 0;
  let templateCount = 0;
  const databases = input.databases.map((database) => {
    const propertyById = new Map(
      database.dataSources.flatMap((source) =>
        source.properties.map((property) => [property.id, property] as const),
      ),
    );
    const mapValue = (propertyId: string, value: unknown): unknown => {
      const property = propertyById.get(propertyId);
      if (!property) return structuredClone(value);
      if (property.type === 'relation') {
        if (Array.isArray(value))
          return value.map((item) => (typeof item === 'string' ? (idMap[item] ?? item) : item));
        return typeof value === 'string' ? (idMap[value] ?? value) : structuredClone(value);
      }
      if (
        property.type === 'select' ||
        property.type === 'status' ||
        property.type === 'multi_select'
      ) {
        if (Array.isArray(value))
          return value.map((item) => (typeof item === 'string' ? (idMap[item] ?? item) : item));
        return typeof value === 'string' ? (idMap[value] ?? value) : structuredClone(value);
      }
      return structuredClone(value);
    };
    const dataSources = database.dataSources.map((source) => {
      const properties = source.properties.map((property): NotionImportPropertyDraft => {
        propertyCount += 1;
        const path = `databases/${database.id}/sources/${source.id}/properties/${property.id}`;
        const mappedType = PROPERTY_TYPE_MAP[property.type];
        let importState: NotionImportPropertyDraft['importState'] = 'ready';
        if (!mappedType) {
          importState = 'unsupported';
          issues.push({
            code: 'unsupported_property',
            severity: 'warning',
            objectKind: 'property',
            notionId: property.id,
            path,
            handling: 'preserved',
            message: `Notion property type "${property.type}" is preserved in the report and not flattened.`,
          });
        } else if (mappedType === 'formula') {
          importState = 'requires_review';
          issues.push({
            code: 'formula_requires_translation',
            severity: 'warning',
            objectKind: 'property',
            notionId: property.id,
            path,
            handling: 'requires_review',
            message:
              'The Notion formula source is preserved but requires explicit translation to the SynapseNote formula AST.',
          });
        } else if (mappedType === 'rollup') {
          importState = 'requires_review';
          issues.push({
            code: 'rollup_requires_review',
            severity: 'warning',
            objectKind: 'property',
            notionId: property.id,
            path,
            handling: 'requires_review',
            message:
              'The rollup references are preserved and require validation against imported relation targets.',
          });
        } else if (
          mappedType === 'relation' &&
          (!property.targetDataSourceId || !idMap[property.targetDataSourceId])
        ) {
          importState = 'unsupported';
          issues.push({
            code: 'relation_target_missing',
            severity: 'blocking',
            objectKind: 'property',
            notionId: property.id,
            path,
            handling: 'preserved',
            message: 'The relation target data source is absent from the export.',
          });
        }
        return {
          id: idMap[property.id] ?? stableId('prop', property.id),
          notionId: property.id,
          key: key(property.name),
          name: property.name,
          type: mappedType ?? property.type,
          importState,
          ...(property.options
            ? {
                options: property.options.map((option) => ({
                  id: idMap[option.id] ?? stableId('opt', option.id),
                  notionId: option.id,
                  key: key(option.name),
                  name: option.name,
                  ...(option.color ? { color: option.color } : {}),
                })),
              }
            : {}),
          ...(property.targetDataSourceId && idMap[property.targetDataSourceId]
            ? { targetSourceId: idMap[property.targetDataSourceId] }
            : {}),
          ...(property.formula ? { formula: structuredClone(property.formula) } : {}),
          ...(property.rollup
            ? {
                rollup: {
                  relationPropertyId:
                    idMap[property.rollup.relationPropertyId] ??
                    stableId('prop', property.rollup.relationPropertyId),
                  targetPropertyId:
                    idMap[property.rollup.targetPropertyId] ??
                    stableId('prop', property.rollup.targetPropertyId),
                  function: property.rollup.function,
                },
              }
            : {}),
        };
      });
      const records = source.records.map((record) => {
        recordCount += 1;
        for (const assetPath of record.assetPaths ?? []) {
          if (availableAssets.get(assetPath) !== true)
            issues.push({
              code: 'missing_asset',
              severity: 'warning',
              objectKind: 'asset',
              notionId: assetPath,
              path: `databases/${database.id}/sources/${source.id}/records/${record.id}/assets/${assetPath}`,
              handling: 'preserved',
              message: `Referenced asset "${assetPath}" is missing from the Notion export.`,
            });
        }
        return {
          id: idMap[record.id] ?? stableId('rec', record.id),
          notionId: record.id,
          values: Object.fromEntries(
            Object.entries(record.propertyValues).map(([propertyId, value]) => [
              idMap[propertyId] ?? stableId('prop', propertyId),
              mapValue(propertyId, value),
            ]),
          ),
          body: record.body,
          assetPaths: [...(record.assetPaths ?? [])],
        };
      });
      return {
        id: idMap[source.id] ?? stableId('ds', source.id),
        notionId: source.id,
        key: key(source.name),
        name: source.name,
        properties,
        records,
      };
    });
    const views = (database.views ?? []).map((view) => {
      viewCount += 1;
      const path = `databases/${database.id}/views/${view.id}`;
      const layout = VIEW_TYPE_MAP[view.type];
      let importState: 'ready' | 'requires_review' | 'unsupported' = layout
        ? 'ready'
        : 'unsupported';
      if (!layout)
        issues.push({
          code: 'unsupported_view',
          severity: 'warning',
          objectKind: 'view',
          notionId: view.id,
          path,
          handling: 'preserved',
          message: `Notion view type "${view.type}" is preserved but cannot be imported directly.`,
        });
      if (view.filter !== undefined) {
        importState = importState === 'unsupported' ? importState : 'requires_review';
        issues.push({
          code: 'view_filter_requires_review',
          severity: 'warning',
          objectKind: 'view',
          notionId: view.id,
          path,
          handling: 'requires_review',
          message:
            'The Notion view filter is preserved and requires semantic review before activation.',
        });
      }
      return {
        id: idMap[view.id] ?? stableId('view', view.id),
        notionId: view.id,
        sourceId: idMap[view.dataSourceId] ?? stableId('ds', view.dataSourceId),
        key: key(view.name),
        name: view.name,
        layout: layout ?? view.type,
        propertyIds: (view.propertyIds ?? []).map((id) => idMap[id] ?? stableId('prop', id)),
        sort: (view.sort ?? []).map((item) => ({
          propertyId: idMap[item.propertyId] ?? stableId('prop', item.propertyId),
          direction: item.direction === 'ascending' ? ('asc' as const) : ('desc' as const),
        })),
        ...(view.filter !== undefined ? { sourceFilter: structuredClone(view.filter) } : {}),
        importState,
      };
    });
    const templates = (database.templates ?? []).map((template) => {
      templateCount += 1;
      return {
        id: idMap[template.id] ?? stableId('tpl', template.id),
        notionId: template.id,
        sourceId: idMap[template.dataSourceId] ?? stableId('ds', template.dataSourceId),
        key: key(template.name),
        name: template.name,
        body: template.body,
        propertyValues: Object.fromEntries(
          Object.entries(template.propertyValues ?? {}).map(([propertyId, value]) => [
            idMap[propertyId] ?? stableId('prop', propertyId),
            mapValue(propertyId, value),
          ]),
        ),
      };
    });
    return {
      id: idMap[database.id] ?? stableId('db', database.id),
      notionId: database.id,
      key: key(database.name),
      name: database.name,
      ...(database.description ? { description: database.description } : {}),
      dataSources,
      views,
      templates,
    };
  });
  return {
    version: 1,
    kind: 'notion-normalized-export',
    requiresConfirmation: true,
    complete: true,
    databases,
    issues: issues.sort(
      (left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code),
    ),
    idMap,
    summary: {
      databases: databases.length,
      dataSources: databases.reduce((total, database) => total + database.dataSources.length, 0),
      properties: propertyCount,
      views: viewCount,
      templates: templateCount,
      records: recordCount,
      unsupported: issues.filter(
        (issue) => issue.handling === 'skipped' || issue.code.startsWith('unsupported_'),
      ).length,
      lossyOrReview: issues.filter((issue) => issue.handling === 'requires_review').length,
      missingAssets: issues.filter((issue) => issue.code === 'missing_asset').length,
    },
  };
}

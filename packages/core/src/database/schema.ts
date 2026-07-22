import { z } from 'zod';
import {
  canonicalDatabaseTimeZone,
  DatabaseDateRangeValueSchema,
  DatabaseDateValueSchema,
} from './date.ts';
import { DatabaseFilesValueSchema, DatabaseFileValueSchema } from './files.ts';
import { FormulaAstSchema, FormulaValueTypeSchema } from './formula.ts';
import {
  buildFormulaDependencyGraph,
  collectFormulaPropertyDependencies,
  type FormulaComputedPropertyInput,
  FormulaDependencyError,
} from './formula-dependencies.ts';
import { DatabasePersonIdSchema, DatabasePersonSchema } from './person.ts';
import { DatabasePlaceValueSchema } from './place.ts';
import { projectDatabaseRichText } from './rich-text.ts';
import {
  DatabaseActionButtonIdSchema,
  DatabaseAutomationIdSchema,
  DatabaseIdSchema,
  DatabaseOptionIdSchema,
  DatabasePropertyIdSchema,
  DatabaseRecordIdSchema,
  DatabaseStableKeySchema,
  DatabaseStatusGroupIdSchema,
  DatabaseTemplateIdSchema,
  DatabaseViewIdSchema,
  DataSourceIdSchema,
} from './stable-ids.ts';

export {
  type DatabaseActionButtonId,
  DatabaseActionButtonIdSchema,
  type DatabaseAutomationId,
  DatabaseAutomationIdSchema,
  type DatabaseId,
  DatabaseIdSchema,
  type DatabaseOptionId,
  DatabaseOptionIdSchema,
  type DatabasePropertyId,
  DatabasePropertyIdSchema,
  type DatabaseRecordId,
  DatabaseRecordIdSchema,
  DatabaseStableKeySchema,
  type DatabaseStatusGroupId,
  DatabaseStatusGroupIdSchema,
  type DatabaseTemplateId,
  DatabaseTemplateIdSchema,
  type DatabaseViewId,
  DatabaseViewIdSchema,
  type DataSourceId,
  DataSourceIdSchema,
} from './stable-ids.ts';

export const DATABASE_MANIFEST_CURRENT_VERSION = 1 as const;
export const DATABASE_MANIFEST_SUPPORTED_VERSIONS = [DATABASE_MANIFEST_CURRENT_VERSION] as const;
export type DatabaseManifestVersion = (typeof DATABASE_MANIFEST_SUPPORTED_VERSIONS)[number];

export const DATABASE_QUERY_OPERATORS = [
  'eq',
  'neq',
  'contains',
  'does_not_contain',
  'starts_with',
  'ends_with',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'is_empty',
  'is_not_empty',
] as const;

export type DatabaseQueryOperator = (typeof DATABASE_QUERY_OPERATORS)[number];
export type DatabaseFilterValue = string | number | boolean | string[] | number[] | boolean[];

export type DatabaseFilter =
  | { and: DatabaseFilter[] }
  | { or: DatabaseFilter[] }
  | { not: DatabaseFilter }
  | {
      propertyId: string;
      operator: Exclude<DatabaseQueryOperator, 'is_empty' | 'is_not_empty'>;
      value: DatabaseFilterValue;
    }
  | {
      propertyId: string;
      operator: 'is_empty' | 'is_not_empty';
    };

const DatabaseFilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number()),
  z.array(z.boolean()),
]);

const valueFilterSchema = z
  .object({
    propertyId: DatabasePropertyIdSchema,
    operator: z.enum([
      'eq',
      'neq',
      'contains',
      'does_not_contain',
      'starts_with',
      'ends_with',
      'gt',
      'gte',
      'lt',
      'lte',
      'in',
    ]),
    value: DatabaseFilterValueSchema,
  })
  .strict();

const emptyFilterSchema = z
  .object({
    propertyId: DatabasePropertyIdSchema,
    operator: z.enum(['is_empty', 'is_not_empty']),
  })
  .strict();

export const DatabaseFilterSchema: z.ZodType<DatabaseFilter> = z.lazy(() =>
  z.union([
    z.object({ and: z.array(DatabaseFilterSchema).min(1) }).strict(),
    z.object({ or: z.array(DatabaseFilterSchema).min(1) }).strict(),
    z.object({ not: DatabaseFilterSchema }).strict(),
    valueFilterSchema,
    emptyFilterSchema,
  ]),
);

export const DATABASE_CONDITIONAL_COLOR_NAMES = [
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
] as const;

export const DatabaseConditionalColorRuleSchema = z
  .object({
    id: z.string().regex(/^ccr_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    key: DatabaseStableKeySchema,
    name: z.string().trim().min(1).max(200),
    color: z.enum(DATABASE_CONDITIONAL_COLOR_NAMES),
    where: DatabaseFilterSchema,
    applyTo: z.discriminatedUnion('type', [
      z.object({ type: z.literal('page') }).strict(),
      z
        .object({
          type: z.literal('property'),
          propertyId: DatabasePropertyIdSchema,
        })
        .strict(),
    ]),
  })
  .strict();

export type DatabaseConditionalColorRule = z.infer<typeof DatabaseConditionalColorRuleSchema>;

export const DATABASE_PROPERTY_TYPES = [
  'title',
  'text',
  'number',
  'checkbox',
  'date',
  'select',
  'status',
  'multi_select',
  'url',
  'email',
  'phone',
  'created_time',
  'last_edited_time',
  'created_by',
  'last_edited_by',
  'verification',
  'button',
  'unique_id',
  'place',
  'person',
  'files',
  'relation',
  'formula',
  'rollup',
] as const;

export type DatabasePropertyType = (typeof DATABASE_PROPERTY_TYPES)[number];

export function isValidDatabaseUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidDatabaseEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidDatabasePhone(value: unknown): value is string {
  if (typeof value !== 'string' || value !== value.trim() || value.length > 40) return false;
  if (!/^\+?[0-9][0-9().\-\s]*$/.test(value)) return false;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 3 && digits.length <= 20;
}

const DatabasePropertyDefaultValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  DatabaseFilesValueSchema,
  DatabaseDateRangeValueSchema,
  DatabasePlaceValueSchema,
]);

export const DatabasePropertySemanticsSchema = z
  .object({
    constraints: z
      .object({
        unique: z.boolean().default(false),
        min: z.number().optional(),
        max: z.number().optional(),
        maxLength: z.number().int().positive().optional(),
        pattern: z.string().max(1_000).optional(),
      })
      .strict()
      .optional()
      .transform((value) => value ?? { unique: false }),
    inferencePolicy: z.enum(['explicit_only', 'agent_suggest', 'agent_allowed']),
    sensitivity: z.enum(['inherit', 'public', 'internal', 'confidential', 'restricted']),
    format: z
      .object({
        style: z.string().trim().min(1).max(64),
        options: z.record(z.string(), z.unknown()).default({}),
      })
      .strict()
      .optional(),
    defaultValue: DatabasePropertyDefaultValueSchema.optional(),
  })
  .strict();

export type DatabasePropertySemantics = z.infer<typeof DatabasePropertySemanticsSchema>;

const propertyBaseShape = {
  id: DatabasePropertyIdSchema,
  key: DatabaseStableKeySchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).optional(),
  aliases: z.array(z.string().trim().min(1).max(200)).default([]),
  required: z.boolean().default(false),
  semantics: DatabasePropertySemanticsSchema.optional().transform(
    (value) =>
      value ?? {
        constraints: { unique: false },
        inferencePolicy: 'explicit_only' as const,
        sensitivity: 'inherit' as const,
      },
  ),
};

const scalarProperty = <
  T extends Exclude<
    DatabasePropertyType,
    | 'select'
    | 'status'
    | 'multi_select'
    | 'person'
    | 'files'
    | 'relation'
    | 'formula'
    | 'rollup'
    | 'created_time'
    | 'last_edited_time'
    | 'created_by'
    | 'last_edited_by'
    | 'verification'
    | 'button'
    | 'unique_id'
    | 'place'
  >,
>(
  type: T,
) =>
  z
    .object({
      ...propertyBaseShape,
      type: z.literal(type),
    })
    .strict();

export const DatabaseOptionSchema = z
  .object({
    id: DatabaseOptionIdSchema,
    key: DatabaseStableKeySchema,
    name: z.string().trim().min(1).max(200),
    color: z.string().trim().min(1).max(64).optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export type DatabaseOption = z.infer<typeof DatabaseOptionSchema>;

export const DATABASE_STATUS_CATEGORIES = ['todo', 'in_progress', 'complete'] as const;
export type DatabaseStatusCategory = (typeof DATABASE_STATUS_CATEGORIES)[number];

export const DatabaseStatusGroupSchema = z
  .object({
    id: DatabaseStatusGroupIdSchema,
    key: DatabaseStableKeySchema,
    name: z.string().trim().min(1).max(200),
    category: z.enum(DATABASE_STATUS_CATEGORIES),
    color: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export type DatabaseStatusGroup = z.infer<typeof DatabaseStatusGroupSchema>;

export const DatabaseStatusOptionSchema = DatabaseOptionSchema.extend({
  groupId: DatabaseStatusGroupIdSchema,
}).strict();

export type DatabaseStatusOption = z.infer<typeof DatabaseStatusOptionSchema>;

function addUniqueOptionIssues(options: readonly DatabaseOption[], ctx: z.RefinementCtx): void {
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const [index, option] of options.entries()) {
    if (ids.has(option.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['options', index, 'id'],
        message: `Duplicate option id "${option.id}"`,
      });
    }
    if (keys.has(option.key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['options', index, 'key'],
        message: `Duplicate option key "${option.key}"`,
      });
    }
    ids.add(option.id);
    keys.add(option.key);
  }
}

const selectProperty = (type: 'select' | 'multi_select') =>
  z
    .object({
      ...propertyBaseShape,
      type: z.literal(type),
      options: z.array(DatabaseOptionSchema).min(1),
    })
    .strict()
    .superRefine((property, ctx) => addUniqueOptionIssues(property.options, ctx));

const statusProperty = z
  .object({
    ...propertyBaseShape,
    type: z.literal('status'),
    groups: z.array(DatabaseStatusGroupSchema).length(DATABASE_STATUS_CATEGORIES.length),
    options: z.array(DatabaseStatusOptionSchema).min(DATABASE_STATUS_CATEGORIES.length),
  })
  .strict()
  .superRefine((property, ctx) => {
    addUniqueOptionIssues(property.options, ctx);
    const groupIds = new Set<string>();
    const groupKeys = new Set<string>();
    property.groups.forEach((group, index) => {
      if (groupIds.has(group.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['groups', index, 'id'],
          message: `Duplicate status group id "${group.id}"`,
        });
      }
      if (groupKeys.has(group.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['groups', index, 'key'],
          message: `Duplicate status group key "${group.key}"`,
        });
      }
      if (group.category !== DATABASE_STATUS_CATEGORIES[index]) {
        ctx.addIssue({
          code: 'custom',
          path: ['groups', index, 'category'],
          message: `Status groups must use todo, in_progress, complete board order`,
        });
      }
      groupIds.add(group.id);
      groupKeys.add(group.key);
    });
    property.options.forEach((option, index) => {
      if (!groupIds.has(option.groupId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['options', index, 'groupId'],
          message: `Status option "${option.id}" references an unknown group`,
        });
      }
    });
    property.groups.forEach((group, index) => {
      if (!property.options.some((option) => option.groupId === group.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['groups', index],
          message: `Status group "${group.key}" must contain at least one option`,
        });
      }
    });
  });

export const DATABASE_ROLLUP_FUNCTIONS = [
  'count_all',
  'count_values',
  'count_unique',
  'percent_empty',
  'percent_not_empty',
  'sum',
  'average',
  'min',
  'max',
  'earliest',
  'latest',
  'show_original',
] as const;

export const DatabaseRollupFunctionSchema = z.enum(DATABASE_ROLLUP_FUNCTIONS);
export type DatabaseRollupFunction = z.infer<typeof DatabaseRollupFunctionSchema>;

function computedProperty<T extends 'formula' | 'rollup', S extends z.ZodRawShape>(
  type: T,
  shape: S,
) {
  return z
    .object({
      ...propertyBaseShape,
      type: z.literal(type),
      required: z.literal(false).default(false),
      ...shape,
    })
    .strict()
    .superRefine((property, context) => {
      const semantics = (property as { semantics: DatabasePropertySemantics }).semantics;
      const constraints = semantics.constraints;
      if (
        semantics.defaultValue !== undefined ||
        semantics.inferencePolicy !== 'explicit_only' ||
        constraints.unique ||
        constraints.min !== undefined ||
        constraints.max !== undefined ||
        constraints.maxLength !== undefined ||
        constraints.pattern !== undefined
      ) {
        context.addIssue({
          code: 'custom',
          path: ['semantics'],
          message: `${type} properties are derived, read-only, and cannot define defaults, inference, or value constraints`,
        });
      }
    });
}

const derivedMetadataProperty = (
  type: 'created_time' | 'last_edited_time' | 'created_by' | 'last_edited_by',
) =>
  z
    .object({
      ...propertyBaseShape,
      type: z.literal(type),
      required: z.literal(false).default(false),
    })
    .strict()
    .superRefine((property, context) => {
      const constraints = property.semantics.constraints;
      if (
        property.semantics.defaultValue !== undefined ||
        property.semantics.inferencePolicy !== 'explicit_only' ||
        constraints.unique ||
        constraints.min !== undefined ||
        constraints.max !== undefined ||
        constraints.maxLength !== undefined ||
        constraints.pattern !== undefined
      ) {
        context.addIssue({
          code: 'custom',
          path: ['semantics'],
          message: `${type} properties are derived, read-only metadata and cannot define defaults, inference, or value constraints`,
        });
      }
    });

const verificationProperty = z
  .object({
    ...propertyBaseShape,
    type: z.literal('verification'),
    required: z.literal(false).default(false),
    allowExpiry: z.boolean().default(true),
    requireEvidenceRevision: z.boolean().default(false),
  })
  .strict()
  .superRefine((property, context) => {
    const constraints = property.semantics.constraints;
    if (
      property.semantics.defaultValue !== undefined ||
      property.semantics.inferencePolicy !== 'explicit_only' ||
      constraints.unique ||
      constraints.min !== undefined ||
      constraints.max !== undefined ||
      constraints.maxLength !== undefined ||
      constraints.pattern !== undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['semantics'],
        message:
          'verification properties are governed metadata and cannot define defaults, inference, or value constraints',
      });
    }
  });

const DatabaseButtonLiteralValueSchema = DatabasePropertyDefaultValueSchema;

export const DatabaseButtonMutationOperationSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('set'),
      propertyId: DatabasePropertyIdSchema,
      value: DatabaseButtonLiteralValueSchema,
    })
    .strict(),
  z.object({ op: z.literal('unset'), propertyId: DatabasePropertyIdSchema }).strict(),
  z
    .object({
      op: z.enum(['add', 'remove']),
      propertyId: DatabasePropertyIdSchema,
      value: z.union([z.string().min(1), DatabaseFileValueSchema]),
    })
    .strict(),
  z
    .object({
      op: z.literal('increment'),
      propertyId: DatabasePropertyIdSchema,
      by: z.number().finite(),
    })
    .strict(),
  z
    .object({
      op: z.literal('append'),
      propertyId: DatabasePropertyIdSchema.optional(),
      value: z.string().max(100_000),
    })
    .strict(),
  z
    .object({
      op: z.enum(['link', 'unlink']),
      propertyId: DatabasePropertyIdSchema,
      recordId: DatabaseRecordIdSchema,
    })
    .strict(),
]);

export type DatabaseButtonMutationOperation = z.infer<typeof DatabaseButtonMutationOperationSchema>;

export const DatabaseButtonActionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      id: DatabaseStableKeySchema,
      kind: z.literal('update_record'),
      operations: z.array(DatabaseButtonMutationOperationSchema).min(1).max(100),
    })
    .strict(),
  z
    .object({
      id: DatabaseStableKeySchema,
      kind: z.literal('create_record'),
      sourceId: DataSourceIdSchema,
      values: z.record(DatabasePropertyIdSchema, DatabaseButtonLiteralValueSchema),
      body: z.string().max(1_000_000).default(''),
    })
    .strict(),
  z
    .object({
      id: DatabaseStableKeySchema,
      kind: z.literal('archive_record'),
      action: z.enum(['archive', 'restore']),
    })
    .strict(),
  z
    .object({
      id: DatabaseStableKeySchema,
      kind: z.literal('external_webhook'),
      connectionId: z.string().regex(/^conn_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
      eventName: DatabaseStableKeySchema,
      propertyIds: z.array(DatabasePropertyIdSchema).max(100).default([]),
      includeBody: z.boolean().default(false),
    })
    .strict(),
]);

export type DatabaseButtonAction = z.infer<typeof DatabaseButtonActionSchema>;

export const DatabaseActionButtonSchema = z
  .object({
    id: DatabaseActionButtonIdSchema,
    key: DatabaseStableKeySchema,
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional(),
    placement: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('database') }).strict(),
      z.object({ kind: z.literal('source'), sourceId: DataSourceIdSchema }).strict(),
    ]),
    confirmation: z
      .object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(2_000).optional(),
      })
      .strict()
      .optional(),
    actions: z
      .array(DatabaseButtonActionSchema)
      .min(1)
      .max(20)
      .refine((actions) => actions.every((action) => action.kind === 'create_record'), {
        message: 'Database and source buttons currently support only scoped create_record actions',
      }),
  })
  .strict();

export type DatabaseActionButton = z.infer<typeof DatabaseActionButtonSchema>;

const buttonProperty = z
  .object({
    ...propertyBaseShape,
    type: z.literal('button'),
    required: z.literal(false).default(false),
    label: z.string().trim().min(1).max(200),
    confirmation: z
      .object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(2_000).optional(),
      })
      .strict()
      .optional(),
    actions: z.array(DatabaseButtonActionSchema).min(1).max(20),
  })
  .strict()
  .superRefine((property, context) => {
    const constraints = property.semantics.constraints;
    if (
      property.semantics.defaultValue !== undefined ||
      property.semantics.inferencePolicy !== 'explicit_only' ||
      constraints.unique ||
      constraints.min !== undefined ||
      constraints.max !== undefined ||
      constraints.maxLength !== undefined ||
      constraints.pattern !== undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['semantics'],
        message:
          'button properties are executable, read-only controls and cannot define defaults, inference, or value constraints',
      });
    }
    const actionIds = new Set<string>();
    let updateCurrentCount = 0;
    let archiveCurrentCount = 0;
    property.actions.forEach((action, index) => {
      if (actionIds.has(action.id)) {
        context.addIssue({
          code: 'custom',
          path: ['actions', index, 'id'],
          message: `Button action id "${action.id}" is duplicated`,
        });
      }
      actionIds.add(action.id);
      if (action.kind === 'update_record') updateCurrentCount += 1;
      if (action.kind === 'archive_record') archiveCurrentCount += 1;
      if (action.kind === 'external_webhook') {
        const ids = new Set<string>();
        action.propertyIds.forEach((propertyId, propertyIndex) => {
          if (ids.has(propertyId)) {
            context.addIssue({
              code: 'custom',
              path: ['actions', index, 'propertyIds', propertyIndex],
              message: `Webhook payload property "${propertyId}" is duplicated`,
            });
          }
          ids.add(propertyId);
        });
      }
    });
    if (archiveCurrentCount > 1) {
      context.addIssue({
        code: 'custom',
        path: ['actions'],
        message: 'A Button can archive or restore the current record at most once',
      });
    }
    if (archiveCurrentCount > 0 && updateCurrentCount > 0) {
      context.addIssue({
        code: 'custom',
        path: ['actions'],
        message:
          'Current-record update and archive/restore cannot share one Button until the transaction planner can compose them into one record target',
      });
    }
  });

const uniqueIdProperty = z
  .object({
    ...propertyBaseShape,
    type: z.literal('unique_id'),
    required: z.literal(false).default(false),
    prefix: z
      .string()
      .trim()
      .max(32)
      .refine((value) => value === '' || /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value), {
        message: 'Unique ID prefix must use letters, numbers, underscores, or hyphens',
      }),
    nextNumber: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  })
  .strict()
  .superRefine((property, context) => {
    const constraints = property.semantics.constraints;
    if (
      property.semantics.defaultValue !== undefined ||
      property.semantics.inferencePolicy !== 'explicit_only' ||
      constraints.unique ||
      constraints.min !== undefined ||
      constraints.max !== undefined ||
      constraints.maxLength !== undefined ||
      constraints.pattern !== undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['semantics'],
        message:
          'unique_id properties are allocated, read-only identifiers and cannot define defaults, inference, or value constraints',
      });
    }
  });

const placeProperty = z
  .object({
    ...propertyBaseShape,
    type: z.literal('place'),
    externalSearch: z.enum(['disabled', 'explicit']).default('disabled'),
    externalMap: z.enum(['disabled', 'explicit']).default('disabled'),
  })
  .strict();

export const DatabasePropertySchema = z.discriminatedUnion('type', [
  z
    .object({
      ...propertyBaseShape,
      type: z.literal('title'),
      required: z.literal(true).default(true),
    })
    .strict(),
  scalarProperty('text'),
  scalarProperty('number'),
  scalarProperty('checkbox'),
  scalarProperty('date'),
  selectProperty('select'),
  statusProperty,
  selectProperty('multi_select'),
  scalarProperty('url'),
  scalarProperty('email'),
  scalarProperty('phone'),
  derivedMetadataProperty('created_time'),
  derivedMetadataProperty('last_edited_time'),
  derivedMetadataProperty('created_by'),
  derivedMetadataProperty('last_edited_by'),
  verificationProperty,
  buttonProperty,
  uniqueIdProperty,
  placeProperty,
  z
    .object({
      ...propertyBaseShape,
      type: z.literal('person'),
      multiple: z.boolean().default(true),
    })
    .strict(),
  z
    .object({
      ...propertyBaseShape,
      type: z.literal('files'),
    })
    .strict(),
  z
    .object({
      ...propertyBaseShape,
      type: z.literal('relation'),
      targetSourceId: DataSourceIdSchema,
      cardinality: z.enum(['one', 'many']).default('many'),
      pairedPropertyId: DatabasePropertyIdSchema.optional(),
    })
    .strict(),
  computedProperty('formula', {
    source: z.string().max(100_000),
    ast: FormulaAstSchema,
  }),
  computedProperty('rollup', {
    relationPropertyId: DatabasePropertyIdSchema,
    targetPropertyId: DatabasePropertyIdSchema,
    function: DatabaseRollupFunctionSchema,
    targetValueType: FormulaValueTypeSchema,
    targetItemType: FormulaValueTypeSchema.optional(),
  }),
]);

export type DatabaseProperty = z.infer<typeof DatabasePropertySchema>;

function computedValueType(property: DatabaseProperty): {
  valueType: z.infer<typeof FormulaValueTypeSchema>;
  itemType?: z.infer<typeof FormulaValueTypeSchema>;
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

const STRING_CONSTRAINT_PROPERTY_TYPES = new Set<DatabasePropertyType>([
  'title',
  'text',
  'url',
  'email',
  'phone',
]);

export function validateDatabasePropertyConstraints(
  property: DatabaseProperty,
  value: unknown,
): string | null {
  const constraints = property.semantics?.constraints ?? { unique: false };
  if (property.type === 'number' && typeof value === 'number') {
    if (constraints.min !== undefined && value < constraints.min) {
      return `must be at least ${constraints.min}`;
    }
    if (constraints.max !== undefined && value > constraints.max) {
      return `must be at most ${constraints.max}`;
    }
  }
  if (STRING_CONSTRAINT_PROPERTY_TYPES.has(property.type) && typeof value === 'string') {
    const constrainedValue =
      property.type === 'text' ? projectDatabaseRichText(value).plainText : value;
    if (
      constraints.maxLength !== undefined &&
      [...constrainedValue].length > constraints.maxLength
    ) {
      return `must contain at most ${constraints.maxLength} characters`;
    }
    if (constraints.pattern !== undefined) {
      try {
        if (!new RegExp(constraints.pattern, 'u').test(constrainedValue)) {
          return `must match pattern ${constraints.pattern}`;
        }
      } catch {
        return 'uses an invalid pattern constraint';
      }
    }
  }
  return null;
}

const NUMBER_FORMAT_STYLES = new Set(['decimal', 'percent', 'currency', 'unit', 'custom']);
const NUMBER_SIGN_DISPLAYS = new Set(['auto', 'always', 'exceptZero', 'never']);

export function validateDatabaseNumberFormat(property: DatabaseProperty): string | null {
  if (property.type !== 'number' || property.semantics.format === undefined) return null;
  const { style, options } = property.semantics.format;
  if (!NUMBER_FORMAT_STYLES.has(style)) return `unsupported number format style "${style}"`;
  const common = new Set([
    'minimumFractionDigits',
    'maximumFractionDigits',
    'useGrouping',
    'signDisplay',
  ]);
  const styleKeys: Record<string, ReadonlySet<string>> = {
    decimal: common,
    percent: common,
    currency: new Set([...common, 'currency', 'currencyDisplay']),
    unit: new Set([...common, 'unit', 'unitDisplay']),
    custom: new Set([...common, 'prefix', 'suffix', 'multiplier']),
  };
  const allowed = styleKeys[style] ?? common;
  const unknown = Object.keys(options).find((key) => !allowed.has(key));
  if (unknown) return `number format style "${style}" does not support option "${unknown}"`;
  const minimum = options.minimumFractionDigits;
  const maximum = options.maximumFractionDigits;
  for (const [key, value] of [
    ['minimumFractionDigits', minimum],
    ['maximumFractionDigits', maximum],
  ] as const) {
    if (
      value !== undefined &&
      (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 20)
    ) {
      return `${key} must be an integer from 0 through 20`;
    }
  }
  if (typeof minimum === 'number' && typeof maximum === 'number' && minimum > maximum) {
    return 'minimumFractionDigits cannot exceed maximumFractionDigits';
  }
  if (options.useGrouping !== undefined && typeof options.useGrouping !== 'boolean') {
    return 'useGrouping must be boolean';
  }
  if (options.signDisplay !== undefined && !NUMBER_SIGN_DISPLAYS.has(String(options.signDisplay))) {
    return 'signDisplay must be auto, always, exceptZero, or never';
  }
  if (style === 'currency') {
    if (typeof options.currency !== 'string' || !/^[A-Z]{3}$/.test(options.currency)) {
      return 'currency format requires a three-letter uppercase currency code';
    }
    if (
      options.currencyDisplay !== undefined &&
      !['symbol', 'narrowSymbol', 'code', 'name'].includes(String(options.currencyDisplay))
    ) {
      return 'currencyDisplay is invalid';
    }
  }
  if (style === 'unit') {
    if (typeof options.unit !== 'string' || options.unit.trim() === '') {
      return 'unit format requires an Intl unit identifier';
    }
    if (
      options.unitDisplay !== undefined &&
      !['short', 'long', 'narrow'].includes(String(options.unitDisplay))
    ) {
      return 'unitDisplay is invalid';
    }
    try {
      new Intl.NumberFormat('en', { style: 'unit', unit: options.unit });
    } catch {
      return `unsupported Intl unit "${options.unit}"`;
    }
  }
  if (style === 'custom') {
    for (const key of ['prefix', 'suffix'] as const) {
      const value = options[key];
      if (value !== undefined && (typeof value !== 'string' || [...value].length > 32)) {
        return `${key} must be a string of at most 32 characters`;
      }
    }
    if (
      options.multiplier !== undefined &&
      (typeof options.multiplier !== 'number' || !Number.isFinite(options.multiplier))
    ) {
      return 'multiplier must be a finite number';
    }
  }
  return null;
}

function isSafeSourceFolder(value: string): boolean {
  if (value === '.' || value === '') return true;
  if (value.includes('\0') || value.includes('\\')) return false;
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '..');
}

function isValidPropertyDefault(property: DatabaseProperty): boolean {
  const value = property.semantics.defaultValue;
  if (value === undefined) return true;
  switch (property.type) {
    case 'title':
    case 'text':
      return typeof value === 'string';
    case 'url':
      return isValidDatabaseUrl(value);
    case 'email':
      return isValidDatabaseEmail(value);
    case 'phone':
      return isValidDatabasePhone(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'checkbox':
      return typeof value === 'boolean';
    case 'date':
      return DatabaseDateValueSchema.safeParse(value).success;
    case 'select':
      return typeof value === 'string' && property.options.some((option) => option.key === value);
    case 'status':
      return (
        typeof value === 'string' &&
        property.options.some((option) => option.key === value && option.archived !== true)
      );
    case 'multi_select':
      return (
        Array.isArray(value) &&
        (!property.required || value.length > 0) &&
        new Set(value as unknown[]).size === value.length &&
        value.every(
          (key) => typeof key === 'string' && property.options.some((option) => option.key === key),
        )
      );
    case 'person':
      return (
        Array.isArray(value) &&
        new Set(value as unknown[]).size === value.length &&
        value.every((personKey) => typeof personKey === 'string') &&
        (!property.required || value.length > 0) &&
        (property.multiple || value.length <= 1)
      );
    case 'files':
      return (
        DatabaseFilesValueSchema.safeParse(value).success &&
        (!property.required || (Array.isArray(value) && value.length > 0))
      );
    case 'place':
      return DatabasePlaceValueSchema.safeParse(value).success;
    case 'relation':
      if (property.cardinality === 'one') return DatabaseRecordIdSchema.safeParse(value).success;
      return (
        Array.isArray(value) &&
        (!property.required || value.length > 0) &&
        new Set(value as unknown[]).size === value.length &&
        value.every((recordId) => DatabaseRecordIdSchema.safeParse(recordId).success)
      );
    case 'formula':
    case 'rollup':
    case 'created_time':
    case 'last_edited_time':
    case 'created_by':
    case 'last_edited_by':
    case 'verification':
    case 'button':
    case 'unique_id':
      return false;
  }
}

function isValidButtonActionValue(property: DatabaseProperty, value: unknown): boolean {
  switch (property.type) {
    case 'title':
    case 'text':
      return typeof value === 'string';
    case 'url':
      return isValidDatabaseUrl(value);
    case 'email':
      return isValidDatabaseEmail(value);
    case 'phone':
      return isValidDatabasePhone(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'checkbox':
      return typeof value === 'boolean';
    case 'date':
      return DatabaseDateValueSchema.safeParse(value).success;
    case 'select':
    case 'status':
      return (
        typeof value === 'string' &&
        property.options.some(
          (option) => (option.id === value || option.key === value) && option.archived !== true,
        )
      );
    case 'multi_select':
      return (
        Array.isArray(value) &&
        new Set(value).size === value.length &&
        value.every(
          (optionId) =>
            typeof optionId === 'string' &&
            property.options.some(
              (option) =>
                (option.id === optionId || option.key === optionId) && option.archived !== true,
            ),
        )
      );
    case 'person':
      return (
        Array.isArray(value) &&
        new Set(value).size === value.length &&
        value.every((personId) => DatabasePersonIdSchema.safeParse(personId).success) &&
        (property.multiple || value.length <= 1)
      );
    case 'files':
      return DatabaseFilesValueSchema.safeParse(value).success;
    case 'place':
      return DatabasePlaceValueSchema.safeParse(value).success;
    case 'relation':
      return property.cardinality === 'one'
        ? DatabaseRecordIdSchema.safeParse(value).success
        : Array.isArray(value) &&
            new Set(value).size === value.length &&
            value.every((recordId) => DatabaseRecordIdSchema.safeParse(recordId).success);
    case 'formula':
    case 'rollup':
    case 'created_time':
    case 'last_edited_time':
    case 'created_by':
    case 'last_edited_by':
    case 'verification':
    case 'button':
    case 'unique_id':
      return false;
  }
}

/** Shared write-surface guard for form defaults and submitted answers. */
export function isDatabaseValueValidForProperty(
  property: DatabaseProperty,
  value: unknown,
): boolean {
  return isValidButtonActionValue(property, value);
}

export const DatabasePageLayoutGroupSchema = z
  .object({
    id: z.string().regex(/^layout_group_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    key: DatabaseStableKeySchema,
    name: z.string().trim().min(1).max(200),
    propertyIds: z.array(DatabasePropertyIdSchema).min(1).max(100),
    collapsed: z.boolean().default(false),
  })
  .strict();

export type DatabasePageLayoutGroup = z.infer<typeof DatabasePageLayoutGroupSchema>;

export const DatabasePageLayoutSectionSchema = z
  .object({
    id: z.string().regex(/^layout_section_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    key: DatabaseStableKeySchema,
    name: z.string().trim().min(1).max(200),
    groups: z.array(DatabasePageLayoutGroupSchema).min(1).max(20),
  })
  .strict();

export type DatabasePageLayoutSection = z.infer<typeof DatabasePageLayoutSectionSchema>;

export const DatabasePageLayoutSchema = z
  .object({
    pinnedPropertyIds: z.array(DatabasePropertyIdSchema).max(4).default([]),
    panelPropertyIds: z.array(DatabasePropertyIdSchema).max(100).default([]),
    hiddenPropertyIds: z.array(DatabasePropertyIdSchema).max(100).default([]),
    sections: z.array(DatabasePageLayoutSectionSchema).max(20).default([]),
    fullWidthContent: z.boolean().default(false),
  })
  .strict();

export type DatabasePageLayout = z.infer<typeof DatabasePageLayoutSchema>;

export const DatabaseRecordPageLayoutOverrideSchema = z
  .object({
    pinnedPropertyIds: z.array(DatabasePropertyIdSchema).max(4).default([]),
    panelPropertyIds: z.array(DatabasePropertyIdSchema).max(100).default([]),
    hiddenPropertyIds: z.array(DatabasePropertyIdSchema).max(100).default([]),
    groupOverrides: z
      .array(
        z
          .object({
            groupId: z.string().regex(/^layout_group_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
            collapsed: z.boolean(),
          })
          .strict(),
      )
      .max(100)
      .default([]),
    fullWidthContent: z.boolean().optional(),
  })
  .strict();

export type DatabaseRecordPageLayoutOverride = z.infer<
  typeof DatabaseRecordPageLayoutOverrideSchema
>;

export function databaseRecordPageLayoutOverrideIssues(
  source: {
    properties: readonly DatabaseProperty[];
    pageLayout?: DatabasePageLayout;
  },
  override: DatabaseRecordPageLayoutOverride,
): string[] {
  const issues: string[] = [];
  const properties = new Map(source.properties.map((property) => [property.id, property] as const));
  const seen = new Set<string>();
  for (const [region, propertyIds] of [
    ['pinned', override.pinnedPropertyIds],
    ['panel', override.panelPropertyIds],
    ['hidden', override.hiddenPropertyIds],
  ] as const) {
    for (const propertyId of propertyIds) {
      const property = properties.get(propertyId);
      if (!property)
        issues.push(`${region} property "${propertyId}" is not defined by this source`);
      else if (property.type === 'title') issues.push('The Title property cannot be overridden');
      if (seen.has(propertyId))
        issues.push(`Property "${propertyId}" is overridden more than once`);
      seen.add(propertyId);
    }
  }
  const explicitPlacements = new Set([
    ...override.pinnedPropertyIds,
    ...override.panelPropertyIds,
    ...override.hiddenPropertyIds,
  ]);
  const effectivePinned = [
    ...override.pinnedPropertyIds,
    ...(source.pageLayout?.pinnedPropertyIds ?? []).filter(
      (propertyId) => !explicitPlacements.has(propertyId),
    ),
  ];
  if (effectivePinned.length > 4) issues.push('A record layout may pin at most four properties');
  if (
    new Set(override.groupOverrides.map((item) => item.groupId)).size !==
    override.groupOverrides.length
  ) {
    issues.push('Group overrides must use unique group IDs');
  }
  const groupIds = new Set(
    source.pageLayout?.sections.flatMap((section) => section.groups.map((group) => group.id)) ?? [],
  );
  for (const item of override.groupOverrides) {
    if (!groupIds.has(item.groupId))
      issues.push(`Overridden group "${item.groupId}" is not in the source layout`);
  }
  return issues;
}

export const DatabaseSourceSchema = z
  .object({
    id: DataSourceIdSchema,
    key: DatabaseStableKeySchema,
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional(),
    recordMeaning: z.string().trim().min(1).max(2_000),
    folder: z.string().max(1_024).refine(isSafeSourceFolder, {
      message: 'Source folder must be relative and must not contain empty or parent segments',
    }),
    includeSubfolders: z.boolean().default(true),
    defaultViewId: DatabaseViewIdSchema.optional(),
    pageLayout: DatabasePageLayoutSchema.optional(),
    properties: z.array(DatabasePropertySchema).min(1),
  })
  .strict()
  .superRefine((source, ctx) => {
    const ids = new Set<string>();
    const keys = new Set<string>();
    let titleCount = 0;

    for (const [index, property] of source.properties.entries()) {
      if (ids.has(property.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['properties', index, 'id'],
          message: `Duplicate property id "${property.id}"`,
        });
      }
      if (keys.has(property.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['properties', index, 'key'],
          message: `Duplicate property key "${property.key}"`,
        });
      }
      if (property.type === 'title') titleCount += 1;
      const constraints = property.semantics.constraints;
      if (
        (constraints.min !== undefined || constraints.max !== undefined) &&
        property.type !== 'number'
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['properties', index, 'semantics', 'constraints'],
          message: `min/max constraints require a number property; found ${property.type}`,
        });
      }
      if (
        (constraints.maxLength !== undefined || constraints.pattern !== undefined) &&
        !STRING_CONSTRAINT_PROPERTY_TYPES.has(property.type)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['properties', index, 'semantics', 'constraints'],
          message: `maxLength/pattern constraints do not support ${property.type}`,
        });
      }
      if (
        constraints.min !== undefined &&
        constraints.max !== undefined &&
        constraints.min > constraints.max
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['properties', index, 'semantics', 'constraints'],
          message: 'min constraint cannot exceed max',
        });
      }
      if (constraints.pattern !== undefined) {
        try {
          new RegExp(constraints.pattern, 'u');
        } catch {
          ctx.addIssue({
            code: 'custom',
            path: ['properties', index, 'semantics', 'constraints', 'pattern'],
            message: 'pattern constraint must be a valid Unicode regular expression',
          });
        }
      }
      if (!isValidPropertyDefault(property)) {
        ctx.addIssue({
          code: 'custom',
          path: ['properties', index, 'semantics', 'defaultValue'],
          message: `Default value is incompatible with ${property.type} property "${property.key}"`,
        });
      }
      if (property.semantics.defaultValue !== undefined) {
        const issue = validateDatabasePropertyConstraints(
          property,
          property.semantics.defaultValue,
        );
        if (issue) {
          ctx.addIssue({
            code: 'custom',
            path: ['properties', index, 'semantics', 'defaultValue'],
            message: `Default value for "${property.key}" ${issue}`,
          });
        }
      }
      const numberFormatIssue = validateDatabaseNumberFormat(property);
      if (numberFormatIssue) {
        ctx.addIssue({
          code: 'custom',
          path: ['properties', index, 'semantics', 'format'],
          message: numberFormatIssue,
        });
      }
      ids.add(property.id);
      keys.add(property.key);
    }

    if (titleCount !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['properties'],
        message: `A data source must define exactly one title property; found ${titleCount}`,
      });
    }

    if (source.pageLayout) {
      const placements: Array<{ propertyId: string; path: (string | number)[] }> = [
        ...source.pageLayout.pinnedPropertyIds.map((propertyId, index) => ({
          propertyId,
          path: ['pageLayout', 'pinnedPropertyIds', index],
        })),
        ...source.pageLayout.panelPropertyIds.map((propertyId, index) => ({
          propertyId,
          path: ['pageLayout', 'panelPropertyIds', index],
        })),
        ...source.pageLayout.hiddenPropertyIds.map((propertyId, index) => ({
          propertyId,
          path: ['pageLayout', 'hiddenPropertyIds', index],
        })),
        ...source.pageLayout.sections.flatMap((section, sectionIndex) =>
          section.groups.flatMap((group, groupIndex) =>
            group.propertyIds.map((propertyId, propertyIndex) => ({
              propertyId,
              path: [
                'pageLayout',
                'sections',
                sectionIndex,
                'groups',
                groupIndex,
                'propertyIds',
                propertyIndex,
              ],
            })),
          ),
        ),
      ];
      const placed = new Set<string>();
      const titleId = source.properties.find((property) => property.type === 'title')?.id;
      for (const placement of placements) {
        if (!ids.has(placement.propertyId)) {
          ctx.addIssue({
            code: 'custom',
            path: placement.path,
            message: `Page layout property "${placement.propertyId}" is not defined by this source`,
          });
        }
        if (placement.propertyId === titleId) {
          ctx.addIssue({
            code: 'custom',
            path: placement.path,
            message: 'The Title property is rendered by the page header and cannot be placed',
          });
        }
        if (placed.has(placement.propertyId)) {
          ctx.addIssue({
            code: 'custom',
            path: placement.path,
            message: `Page layout property "${placement.propertyId}" is placed more than once`,
          });
        }
        placed.add(placement.propertyId);
      }
      for (const field of ['id', 'key'] as const) {
        const sectionValues = new Set<string>();
        const groupValues = new Set<string>();
        for (const [sectionIndex, section] of source.pageLayout.sections.entries()) {
          if (sectionValues.has(section[field])) {
            ctx.addIssue({
              code: 'custom',
              path: ['pageLayout', 'sections', sectionIndex, field],
              message: `Page layout repeats section ${field} "${section[field]}"`,
            });
          }
          sectionValues.add(section[field]);
          for (const [groupIndex, group] of section.groups.entries()) {
            if (groupValues.has(group[field])) {
              ctx.addIssue({
                code: 'custom',
                path: ['pageLayout', 'sections', sectionIndex, 'groups', groupIndex, field],
                message: `Page layout repeats group ${field} "${group[field]}"`,
              });
            }
            groupValues.add(group[field]);
          }
        }
      }
    }
  });

export type DatabaseSource = z.infer<typeof DatabaseSourceSchema>;

export const DatabaseSourceOptionMappingSchema = z
  .object({
    sourceOptionId: DatabaseOptionIdSchema,
    targetOptionId: DatabaseOptionIdSchema,
  })
  .strict();

export type DatabaseSourceOptionMapping = z.infer<typeof DatabaseSourceOptionMappingSchema>;

export const DatabaseSourcePropertyMappingSchema = z
  .object({
    sourcePropertyId: DatabasePropertyIdSchema,
    targetPropertyId: DatabasePropertyIdSchema,
    optionMappings: z.array(DatabaseSourceOptionMappingSchema).default([]),
  })
  .strict();

export type DatabaseSourcePropertyMapping = z.infer<typeof DatabaseSourcePropertyMappingSchema>;

export const DatabaseSourceMappingSchema = z
  .object({
    sourceId: DataSourceIdSchema,
    targetSourceId: DataSourceIdSchema,
    propertyMappings: z.array(DatabaseSourcePropertyMappingSchema).min(1),
  })
  .strict();

export type DatabaseSourceMapping = z.infer<typeof DatabaseSourceMappingSchema>;

export const DATABASE_VIEW_LAYOUTS = [
  'table',
  'board',
  'timeline',
  'calendar',
  'list',
  'gallery',
  'chart',
  'map',
  'feed',
  'dashboard',
  'form',
  'agent',
] as const;

export type DatabaseViewLayout = (typeof DATABASE_VIEW_LAYOUTS)[number];

export const DatabaseTableViewConfigurationSchema = z
  .object({
    wrap: z.boolean().optional(),
    rowHeight: z.enum(['compact', 'standard', 'tall']).optional(),
    propertyWidths: z
      .record(DatabasePropertyIdSchema, z.number().int().min(120).max(480))
      .optional(),
  })
  .strict();

export type DatabaseTableViewConfiguration = z.infer<typeof DatabaseTableViewConfigurationSchema>;

export const DatabaseBoardViewConfigurationSchema = z
  .object({
    cardSize: z.enum(['small', 'medium', 'large']).default('medium'),
    cardPreview: z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('none') }).strict(),
        z.object({ type: z.literal('files'), propertyId: DatabasePropertyIdSchema }).strict(),
      ])
      .default({ type: 'none' }),
    fitImage: z.boolean().default(false),
    colorColumns: z.boolean().default(true),
    groupLimit: z.number().int().min(1).max(500).default(100),
    cardLimitPerGroup: z.number().int().min(1).max(500).default(100),
  })
  .strict();

export type DatabaseBoardViewConfiguration = z.infer<typeof DatabaseBoardViewConfigurationSchema>;

export const DatabaseTimelineViewConfigurationSchema = z
  .object({
    dateMapping: z.discriminatedUnion('type', [
      z.object({ type: z.literal('range'), propertyId: DatabasePropertyIdSchema }).strict(),
      z
        .object({
          type: z.literal('separate'),
          startPropertyId: DatabasePropertyIdSchema,
          endPropertyId: DatabasePropertyIdSchema,
        })
        .strict()
        .refine((mapping) => mapping.startPropertyId !== mapping.endPropertyId, {
          message: 'Timeline start and end properties must be different',
          path: ['endPropertyId'],
        }),
    ]),
    scale: z.enum(['hour', 'day', 'week', 'month', 'quarter', 'year']).default('week'),
    showTable: z.boolean().default(true),
    showToday: z.boolean().default(true),
    showDependencies: z.boolean().default(true),
    dependencyPropertyId: DatabasePropertyIdSchema.optional(),
    noDateLane: z.boolean().default(true),
    loadLimit: z.number().int().min(1).max(500).default(100),
  })
  .strict();

export type DatabaseTimelineViewConfiguration = z.infer<
  typeof DatabaseTimelineViewConfigurationSchema
>;

export const DatabaseCalendarViewConfigurationSchema = z
  .object({
    datePropertyId: DatabasePropertyIdSchema,
    display: z.enum(['month', 'week']).default('month'),
    weekStartsOn: z.enum(['sunday', 'monday']).default('monday'),
    timeZone: z
      .string()
      .refine((value) => canonicalDatabaseTimeZone(value) !== null, 'Expected an IANA timezone')
      .default('UTC'),
    showWeekends: z.boolean().default(true),
    cardLimitPerDay: z.number().int().min(1).max(100).default(10),
  })
  .strict();

export type DatabaseCalendarViewConfiguration = z.infer<
  typeof DatabaseCalendarViewConfigurationSchema
>;

export const DatabaseListViewConfigurationSchema = z
  .object({
    hierarchy: z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('flat') }).strict(),
        z
          .object({
            type: z.literal('parent_relation'),
            propertyId: DatabasePropertyIdSchema,
          })
          .strict(),
      ])
      .default({ type: 'flat' }),
    density: z.enum(['compact', 'comfortable']).default('compact'),
    showSections: z.boolean().default(true),
    collapsibleSections: z.boolean().default(true),
    showDividers: z.boolean().default(true),
    loadLimit: z.number().int().min(1).max(500).default(100),
  })
  .strict();

export type DatabaseListViewConfiguration = z.infer<typeof DatabaseListViewConfigurationSchema>;

export const DatabaseGalleryViewConfigurationSchema = z
  .object({
    cardSize: z.enum(['small', 'medium', 'large']).default('medium'),
    cardPreview: z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('none') }).strict(),
        z.object({ type: z.literal('files'), propertyId: DatabasePropertyIdSchema }).strict(),
      ])
      .default({ type: 'none' }),
    fitImage: z.boolean().default(false),
    showTitle: z.boolean().default(true),
    fallbackStyle: z.enum(['document', 'color']).default('color'),
    loadLimit: z.number().int().min(1).max(500).default(100),
  })
  .strict();

export type DatabaseGalleryViewConfiguration = z.infer<
  typeof DatabaseGalleryViewConfigurationSchema
>;

export const DatabaseChartViewConfigurationSchema = z
  .object({
    chartType: z
      .enum(['vertical_bar', 'horizontal_bar', 'line', 'donut', 'number'])
      .default('vertical_bar'),
    dimension: z
      .object({
        propertyId: DatabasePropertyIdSchema,
        arrayMode: z.enum(['set', 'each']).default('each'),
      })
      .strict()
      .optional(),
    seriesPropertyId: DatabasePropertyIdSchema.optional(),
    measure: z.discriminatedUnion('type', [
      z.object({ type: z.literal('count') }).strict(),
      z
        .object({
          type: z.literal('property'),
          propertyId: DatabasePropertyIdSchema,
          function: z.enum([
            'count_values',
            'count_unique',
            'sum',
            'average',
            'median',
            'min',
            'max',
            'range',
          ]),
        })
        .strict(),
    ]),
    showLegend: z.boolean().default(true),
    showLabels: z.boolean().default(false),
    showAxisNames: z.boolean().default(true),
    groupLimit: z.number().int().min(1).max(200).default(200),
    loadLimit: z.number().int().min(1).max(500).default(500),
  })
  .strict()
  .superRefine((configuration, context) => {
    if (configuration.chartType !== 'number' && !configuration.dimension) {
      context.addIssue({
        code: 'custom',
        path: ['dimension'],
        message: 'Bar, line, and donut charts require a dimension',
      });
    }
    if (
      (configuration.chartType === 'number' || configuration.chartType === 'donut') &&
      configuration.seriesPropertyId
    ) {
      context.addIssue({
        code: 'custom',
        path: ['seriesPropertyId'],
        message: 'Number and donut charts do not support a series dimension',
      });
    }
    if (
      configuration.dimension &&
      configuration.seriesPropertyId === configuration.dimension.propertyId
    ) {
      context.addIssue({
        code: 'custom',
        path: ['seriesPropertyId'],
        message: 'Chart dimension and series properties must be different',
      });
    }
  });

export type DatabaseChartViewConfiguration = z.infer<typeof DatabaseChartViewConfigurationSchema>;

export const DatabaseMapViewConfigurationSchema = z
  .object({
    placePropertyId: DatabasePropertyIdSchema,
    basemap: z.enum(['local', 'openstreetmap']).default('local'),
    clustering: z.boolean().default(true),
    clusterRadius: z.number().int().min(24).max(120).default(48),
    showLabels: z.boolean().default(true),
    showMissingLocations: z.boolean().default(true),
    initialZoom: z.number().int().min(0).max(18).default(2),
    initialCenter: z
      .object({
        lat: z.number().finite().min(-85.051129).max(85.051129),
        lon: z.number().finite().min(-180).max(180),
      })
      .strict()
      .optional(),
    loadLimit: z.number().int().min(1).max(100).default(100),
  })
  .strict();

export type DatabaseMapViewConfiguration = z.infer<typeof DatabaseMapViewConfigurationSchema>;

export const DatabaseFeedViewConfigurationSchema = z
  .object({
    chronologyPropertyId: DatabasePropertyIdSchema,
    authorPropertyId: DatabasePropertyIdSchema.optional(),
    density: z.enum(['compact', 'comfortable']).default('comfortable'),
    showProperties: z.boolean().default(true),
    readTracking: z.enum(['none', 'session']).default('session'),
    loadLimit: z.number().int().min(1).max(100).default(50),
  })
  .strict();

export type DatabaseFeedViewConfiguration = z.infer<typeof DatabaseFeedViewConfigurationSchema>;

export const DatabaseDashboardWidgetSchema = z
  .object({
    id: z.string().regex(/^dshw_[a-z0-9][a-z0-9_-]{2,63}$/),
    viewId: DatabaseViewIdSchema,
    title: z.string().trim().min(1).max(200).optional(),
    width: z.number().int().min(1).max(4).default(4),
  })
  .strict();

export const DatabaseDashboardGlobalFilterSchema = z
  .object({
    id: z.string().regex(/^dshf_[a-z0-9][a-z0-9_-]{2,63}$/),
    key: DatabaseStableKeySchema,
    name: z.string().trim().min(1).max(200),
    enabledByDefault: z.boolean().default(true),
    clauses: z
      .array(
        z
          .object({
            sourceId: DataSourceIdSchema,
            where: DatabaseFilterSchema,
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

export const DatabaseDashboardViewConfigurationSchema = z
  .object({
    rows: z
      .array(
        z
          .object({
            id: z.string().regex(/^dshr_[a-z0-9][a-z0-9_-]{2,63}$/),
            height: z.enum(['small', 'medium', 'large']).default('medium'),
            widgets: z.array(DatabaseDashboardWidgetSchema).min(1).max(4),
          })
          .strict()
          .superRefine((row, context) => {
            if (row.widgets.reduce((sum, widget) => sum + widget.width, 0) > 4) {
              context.addIssue({
                code: 'custom',
                path: ['widgets'],
                message: 'Dashboard widget widths cannot exceed four columns in one row',
              });
            }
          }),
      )
      .min(1)
      .max(12),
    globalFilters: z.array(DatabaseDashboardGlobalFilterSchema).max(20).default([]),
    interactions: z
      .array(
        z
          .object({
            sourceWidgetId: z.string().regex(/^dshw_[a-z0-9][a-z0-9_-]{2,63}$/),
            targetWidgetId: z.string().regex(/^dshw_[a-z0-9][a-z0-9_-]{2,63}$/),
            targetRelationPropertyId: DatabasePropertyIdSchema,
          })
          .strict(),
      )
      .max(24)
      .default([]),
  })
  .strict()
  .superRefine((configuration, context) => {
    const rows = new Set<string>();
    const widgets = new Set<string>();
    const filters = new Set<string>();
    const filterKeys = new Set<string>();
    const interactions = new Set<string>();
    let widgetCount = 0;
    for (const [rowIndex, row] of configuration.rows.entries()) {
      if (rows.has(row.id)) {
        context.addIssue({
          code: 'custom',
          path: ['rows', rowIndex, 'id'],
          message: 'Dashboard row IDs must be unique',
        });
      }
      rows.add(row.id);
      for (const [widgetIndex, widget] of row.widgets.entries()) {
        widgetCount += 1;
        if (widgets.has(widget.id)) {
          context.addIssue({
            code: 'custom',
            path: ['rows', rowIndex, 'widgets', widgetIndex, 'id'],
            message: 'Dashboard widget IDs must be unique',
          });
        }
        widgets.add(widget.id);
      }
    }
    if (widgetCount > 12) {
      context.addIssue({
        code: 'custom',
        path: ['rows'],
        message: 'A Dashboard supports at most 12 widgets',
      });
    }
    for (const [filterIndex, filter] of configuration.globalFilters.entries()) {
      if (filters.has(filter.id) || filterKeys.has(filter.key)) {
        context.addIssue({
          code: 'custom',
          path: ['globalFilters', filterIndex],
          message: 'Dashboard filter IDs and keys must be unique',
        });
      }
      filters.add(filter.id);
      filterKeys.add(filter.key);
      const sources = new Set<string>();
      for (const [clauseIndex, clause] of filter.clauses.entries()) {
        if (sources.has(clause.sourceId)) {
          context.addIssue({
            code: 'custom',
            path: ['globalFilters', filterIndex, 'clauses', clauseIndex, 'sourceId'],
            message: 'A Dashboard filter can define only one clause per source',
          });
        }
        sources.add(clause.sourceId);
      }
    }
    for (const [interactionIndex, interaction] of configuration.interactions.entries()) {
      const interactionKey = `${interaction.sourceWidgetId}:${interaction.targetWidgetId}:${interaction.targetRelationPropertyId}`;
      if (interactions.has(interactionKey)) {
        context.addIssue({
          code: 'custom',
          path: ['interactions', interactionIndex],
          message: 'Dashboard interactions must be unique',
        });
      }
      interactions.add(interactionKey);
      if (!widgets.has(interaction.sourceWidgetId) || !widgets.has(interaction.targetWidgetId)) {
        context.addIssue({
          code: 'custom',
          path: ['interactions', interactionIndex],
          message: 'Dashboard interactions must reference widgets in the same Dashboard',
        });
      }
      if (interaction.sourceWidgetId === interaction.targetWidgetId) {
        context.addIssue({
          code: 'custom',
          path: ['interactions', interactionIndex],
          message: 'A Dashboard widget cannot filter itself',
        });
      }
    }
  });

export type DatabaseDashboardViewConfiguration = z.infer<
  typeof DatabaseDashboardViewConfigurationSchema
>;

/** Values a form may map into one writable database property. */
export const DatabaseFormValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number().finite()),
  z.array(z.boolean()),
  DatabaseFilesValueSchema,
  DatabaseDateRangeValueSchema,
  DatabasePlaceValueSchema,
]);

export type DatabaseFormValue = z.infer<typeof DatabaseFormValueSchema>;

const DatabaseFormConditionSchema = z
  .object({
    questionId: z.string().regex(/^frmq_[a-z0-9][a-z0-9_-]{2,63}$/),
    operator: z.enum(['equals', 'not_equals', 'is_empty', 'is_not_empty']),
    value: DatabaseFormValueSchema.optional(),
  })
  .strict()
  .superRefine((condition, context) => {
    const requiresValue = condition.operator === 'equals' || condition.operator === 'not_equals';
    if (requiresValue !== (condition.value !== undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: requiresValue
          ? `${condition.operator} requires a comparison value`
          : `${condition.operator} does not accept a comparison value`,
      });
    }
  });

export const DatabaseFormQuestionSchema = z
  .object({
    id: z.string().regex(/^frmq_[a-z0-9][a-z0-9_-]{2,63}$/),
    propertyId: DatabasePropertyIdSchema,
    label: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1_000).optional(),
    placeholder: z.string().max(500).optional(),
    required: z.boolean().default(false),
    visibleWhen: z
      .object({
        mode: z.enum(['all', 'any']).default('all'),
        conditions: z.array(DatabaseFormConditionSchema).min(1).max(20),
      })
      .strict()
      .optional(),
  })
  .strict();

export type DatabaseFormQuestion = z.infer<typeof DatabaseFormQuestionSchema>;

export const DatabaseFormViewConfigurationSchema = z
  .object({
    access: z.enum(['internal', 'public']).default('internal'),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional(),
    questions: z.array(DatabaseFormQuestionSchema).min(1).max(200),
    defaults: z.record(DatabasePropertyIdSchema, DatabaseFormValueSchema).default({}),
    confirmation: z
      .object({
        title: z.string().trim().min(1).max(200).default('Response submitted'),
        message: z.string().trim().max(2_000).default('Your response has been saved.'),
        allowAnotherResponse: z.boolean().default(true),
      })
      .strict()
      .default({
        title: 'Response submitted',
        message: 'Your response has been saved.',
        allowAnotherResponse: true,
      }),
    closesAt: z.string().datetime({ offset: true }).optional(),
    closedMessage: z
      .string()
      .trim()
      .max(2_000)
      .default('This form is no longer accepting responses.'),
    fileUploads: z
      .object({
        enabled: z.boolean().default(false),
        maxFilesPerQuestion: z.number().int().min(1).max(20).default(5),
      })
      .strict()
      .default({ enabled: false, maxFilesPerQuestion: 5 }),
    spamProtection: z
      .object({
        honeypot: z.boolean().default(true),
        minimumCompletionSeconds: z.number().int().min(0).max(300).default(2),
        rateLimit: z
          .object({
            maxSubmissions: z.number().int().min(1).max(1_000).default(10),
            windowSeconds: z.number().int().min(10).max(86_400).default(60),
          })
          .strict()
          .default({ maxSubmissions: 10, windowSeconds: 60 }),
      })
      .strict()
      .default({
        honeypot: true,
        minimumCompletionSeconds: 2,
        rateLimit: { maxSubmissions: 10, windowSeconds: 60 },
      }),
    duplicateSubmission: z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('allow') }).strict(),
        z
          .object({ type: z.literal('reject_property'), propertyId: DatabasePropertyIdSchema })
          .strict(),
      ])
      .default({ type: 'allow' }),
    retention: z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('workspace') }).strict(),
        z
          .object({ type: z.literal('delete_after'), days: z.number().int().min(1).max(3_650) })
          .strict(),
      ])
      .default({ type: 'workspace' }),
  })
  .strict()
  .superRefine((configuration, context) => {
    const questionIds = new Set<string>();
    const propertyIds = new Set<string>();
    for (const [index, question] of configuration.questions.entries()) {
      if (questionIds.has(question.id)) {
        context.addIssue({
          code: 'custom',
          path: ['questions', index, 'id'],
          message: `Form repeats question id "${question.id}"`,
        });
      }
      if (propertyIds.has(question.propertyId)) {
        context.addIssue({
          code: 'custom',
          path: ['questions', index, 'propertyId'],
          message: `Form repeats property "${question.propertyId}"`,
        });
      }
      for (const condition of question.visibleWhen?.conditions ?? []) {
        if (!questionIds.has(condition.questionId)) {
          context.addIssue({
            code: 'custom',
            path: ['questions', index, 'visibleWhen'],
            message: `Conditional question must reference an earlier question; found "${condition.questionId}"`,
          });
        }
      }
      questionIds.add(question.id);
      propertyIds.add(question.propertyId);
    }
  });

export type DatabaseFormViewConfiguration = z.infer<typeof DatabaseFormViewConfigurationSchema>;

export const DatabaseLinkedViewReferenceSchema = z
  .object({
    version: z.literal(1).default(1),
    databaseId: DatabaseIdSchema,
    sourceId: DataSourceIdSchema,
    viewId: DatabaseViewIdSchema,
    mode: z.enum(['inline', 'full-page']).default('inline'),
  })
  .strict();

export type DatabaseLinkedViewReference = z.infer<typeof DatabaseLinkedViewReferenceSchema>;

const DatabaseViewLayoutSchema = z.union([
  z
    .object({
      type: z.literal('table'),
      configuration: DatabaseTableViewConfigurationSchema.default({}),
    })
    .strict(),
  z
    .object({
      type: z.literal('board'),
      configuration: DatabaseBoardViewConfigurationSchema.default({
        cardSize: 'medium',
        cardPreview: { type: 'none' },
        fitImage: false,
        colorColumns: true,
        groupLimit: 100,
        cardLimitPerGroup: 100,
      }),
    })
    .strict(),
  z
    .object({
      type: z.literal('timeline'),
      configuration: DatabaseTimelineViewConfigurationSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('calendar'),
      configuration: DatabaseCalendarViewConfigurationSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('list'),
      configuration: DatabaseListViewConfigurationSchema.default({
        hierarchy: { type: 'flat' },
        density: 'compact',
        showSections: true,
        collapsibleSections: true,
        showDividers: true,
        loadLimit: 100,
      }),
    })
    .strict(),
  z
    .object({
      type: z.literal('gallery'),
      configuration: DatabaseGalleryViewConfigurationSchema.default({
        cardSize: 'medium',
        cardPreview: { type: 'none' },
        fitImage: false,
        showTitle: true,
        fallbackStyle: 'color',
        loadLimit: 100,
      }),
    })
    .strict(),
  z
    .object({
      type: z.literal('chart'),
      configuration: DatabaseChartViewConfigurationSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('form'),
      configuration: DatabaseFormViewConfigurationSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('map'),
      configuration: DatabaseMapViewConfigurationSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('feed'),
      configuration: DatabaseFeedViewConfigurationSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('dashboard'),
      configuration: DatabaseDashboardViewConfigurationSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('agent'),
      configuration: z.record(z.string(), z.unknown()).default({}),
    })
    .strict(),
]);

const DatabaseViewSortSchema = z
  .object({
    propertyId: DatabasePropertyIdSchema,
    direction: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();

const DatabaseViewGroupSchema = z
  .object({
    propertyId: DatabasePropertyIdSchema,
    direction: z.enum(['asc', 'desc']).default('asc'),
    hideEmpty: z.boolean().default(false),
  })
  .strict();

export const DATABASE_AGENT_VIEW_WRITE_ACTIONS = [
  'create_record',
  'update_record',
  'delete_record',
  'alter_schema',
] as const;

export const DatabaseAgentViewConfigSchema = z
  .object({
    semanticContract: z
      .object({
        purpose: z.string().trim().min(1).max(2_000),
        instructions: z.string().trim().min(1).max(4_000).optional(),
        evidence: z.enum(['required', 'preferred', 'none']).default('required'),
        freshness: z
          .enum(['require_current', 'allow_stale_with_warning'])
          .default('require_current'),
      })
      .strict(),
    tokenBudget: z
      .object({
        maxTokens: z.number().int().min(128).max(100_000),
        reserveTokens: z.number().int().min(0).max(50_000).default(0),
        tokenizer: z.enum(['utf8_bytes_div3', 'utf8_bytes_div2']),
        encoding: z.enum(['object_rows', 'columnar_dictionary']),
      })
      .strict()
      .refine((budget) => budget.reserveTokens < budget.maxTokens, {
        message: 'Agent View reserveTokens must be smaller than maxTokens',
        path: ['reserveTokens'],
      }),
    scope: z
      .object({
        maxRecords: z.number().int().min(1).max(500),
        relationDepth: z.number().int().min(0).max(3).default(0),
        relationMaxRecords: z.number().int().min(1).max(500).default(50),
        relationFanOut: z.number().int().min(1).max(50).default(10),
      })
      .strict(),
    readPolicy: z
      .object({
        /** Highest property/body classification that may enter agent context. */
        maxSensitivity: z
          .enum(['public', 'internal', 'confidential', 'restricted'])
          .default('internal'),
      })
      .strict()
      .default({ maxSensitivity: 'internal' }),
    writePolicy: z
      .object({
        mode: z.enum(['read_only', 'review', 'bounded']),
        allowedActions: z.array(z.enum(DATABASE_AGENT_VIEW_WRITE_ACTIONS)).default([]),
        allowedPropertyIds: z.array(DatabasePropertyIdSchema).default([]),
        maxRecordsPerCommit: z.number().int().min(0).max(500).default(0),
      })
      .strict()
      .superRefine((policy, ctx) => {
        if (
          policy.mode === 'read_only' &&
          (policy.allowedActions.length > 0 ||
            policy.allowedPropertyIds.length > 0 ||
            policy.maxRecordsPerCommit !== 0)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['mode'],
            message: 'A read-only Agent View cannot grant write actions, properties, or records',
          });
        }
        if (
          policy.mode !== 'read_only' &&
          (policy.allowedActions.length === 0 || policy.maxRecordsPerCommit < 1)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['allowedActions'],
            message: 'A writable Agent View requires actions and a positive record budget',
          });
        }
        if (new Set(policy.allowedActions).size !== policy.allowedActions.length) {
          ctx.addIssue({
            code: 'custom',
            path: ['allowedActions'],
            message: 'Agent View write actions must be unique',
          });
        }
        if (new Set(policy.allowedPropertyIds).size !== policy.allowedPropertyIds.length) {
          ctx.addIssue({
            code: 'custom',
            path: ['allowedPropertyIds'],
            message: 'Agent View writable properties must be unique',
          });
        }
      }),
  })
  .strict();

export type DatabaseAgentViewConfig = z.infer<typeof DatabaseAgentViewConfigSchema>;

export const DatabaseViewOpenBehaviorSchema = z.enum(['side_peek', 'center_peek', 'full_page']);

export type DatabaseViewOpenBehavior = z.infer<typeof DatabaseViewOpenBehaviorSchema>;

export const DatabaseViewSchema = z
  .object({
    id: DatabaseViewIdSchema,
    key: DatabaseStableKeySchema,
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional(),
    favorite: z.boolean().optional(),
    openBehavior: DatabaseViewOpenBehaviorSchema.optional(),
    sourceId: DataSourceIdSchema,
    layout: DatabaseViewLayoutSchema,
    where: DatabaseFilterSchema.optional(),
    conditionalColors: z.array(DatabaseConditionalColorRuleSchema).max(100).default([]),
    sort: z.array(DatabaseViewSortSchema).default([]),
    groups: z.array(DatabaseViewGroupSchema).max(2).default([]),
    projection: z
      .object({
        propertyIds: z.array(DatabasePropertyIdSchema).min(1),
        body: z.enum(['hidden', 'preview', 'full']).default('hidden'),
      })
      .strict(),
    agent: DatabaseAgentViewConfigSchema.optional(),
  })
  .strict()
  .superRefine((view, ctx) => {
    const duplicate = (ids: readonly string[], path: string): void => {
      const seen = new Set<string>();
      for (const [index, id] of ids.entries()) {
        if (seen.has(id)) {
          ctx.addIssue({
            code: 'custom',
            path: [path, index, 'propertyId'],
            message: `View repeats property id "${id}"`,
          });
        }
        seen.add(id);
      }
    };
    duplicate(
      view.sort.map((item) => item.propertyId),
      'sort',
    );
    duplicate(
      view.groups.map((item) => item.propertyId),
      'groups',
    );
    for (const field of ['id', 'key'] as const) {
      const seen = new Set<string>();
      for (const [index, rule] of view.conditionalColors.entries()) {
        if (seen.has(rule[field])) {
          ctx.addIssue({
            code: 'custom',
            path: ['conditionalColors', index, field],
            message: `View repeats conditional color rule ${field} "${rule[field]}"`,
          });
        }
        seen.add(rule[field]);
      }
    }
    const projected = new Set<string>();
    for (const [index, propertyId] of view.projection.propertyIds.entries()) {
      if (projected.has(propertyId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['projection', 'propertyIds', index],
          message: `View projection repeats property id "${propertyId}"`,
        });
      }
      projected.add(propertyId);
    }
    if (view.layout.type === 'agent' && !view.agent) {
      ctx.addIssue({
        code: 'custom',
        path: ['agent'],
        message: 'An Agent View requires a typed agent contract',
      });
    }
    if (view.layout.type === 'board' && view.groups.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['groups'],
        message: 'A Board view requires a primary group',
      });
    }
    if (view.layout.type !== 'agent' && view.agent) {
      ctx.addIssue({
        code: 'custom',
        path: ['agent'],
        message: 'Only an agent-layout view may define an agent contract',
      });
    }
    if (view.layout.type === 'agent' && view.groups.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['groups'],
        message: 'Agent Views use typed query scope and cannot define visual grouping',
      });
    }
    for (const [index, propertyId] of (
      view.agent?.writePolicy.allowedPropertyIds ?? []
    ).entries()) {
      if (!projected.has(propertyId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['agent', 'writePolicy', 'allowedPropertyIds', index],
          message: `Agent View cannot write unprojected property "${propertyId}"`,
        });
      }
    }
  });

export type DatabaseView = z.infer<typeof DatabaseViewSchema>;

function collectFilterPropertyIds(filter: DatabaseFilter): string[] {
  if ('and' in filter) return filter.and.flatMap(collectFilterPropertyIds);
  if ('or' in filter) return filter.or.flatMap(collectFilterPropertyIds);
  if ('not' in filter) return collectFilterPropertyIds(filter.not);
  return [filter.propertyId];
}

export const DatabaseMachineContractSchema = z
  .object({
    purpose: z.string().trim().min(1).max(2_000),
    canonicality: z.enum(['canonical', 'mirror', 'derived']),
    vocabulary: z.array(z.string().trim().min(1).max(200)).max(200),
    defaultTimePropertyId: DatabasePropertyIdSchema.optional(),
    freshness: z
      .object({
        expectation: z.enum(['realtime', 'hourly', 'daily', 'weekly', 'manual']),
        maxAgeSeconds: z.number().int().positive().optional(),
      })
      .strict(),
    sensitivity: z.enum(['public', 'internal', 'confidential', 'restricted']),
  })
  .strict();

export type DatabaseMachineContract = z.infer<typeof DatabaseMachineContractSchema>;

export const DatabaseTemplateRepeatSchema = z
  .object({
    schedule: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('daily'),
          time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
        })
        .strict(),
      z
        .object({
          kind: z.literal('weekly'),
          weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
          time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
        })
        .strict()
        .refine((value) => new Set(value.weekdays).size === value.weekdays.length, {
          message: 'Repeating-template weekdays must be unique',
          path: ['weekdays'],
        }),
      z
        .object({
          kind: z.literal('monthly'),
          day: z.number().int().min(1).max(28),
          time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
        })
        .strict(),
      z
        .object({
          kind: z.literal('interval'),
          every: z.number().int().min(1).max(365),
          unit: z.enum(['hours', 'days', 'weeks']),
          anchor: z.string().datetime({ offset: true }),
        })
        .strict(),
    ]),
    timeZone: z
      .string()
      .refine((value) => canonicalDatabaseTimeZone(value) !== null, 'Expected an IANA timezone'),
    ownerId: DatabasePersonIdSchema,
    paused: z.boolean().default(true),
    retry: z
      .object({
        maxAttempts: z.number().int().min(1).max(10).default(3),
        initialBackoffSeconds: z.number().int().min(1).max(86_400).default(60),
        multiplier: z.number().min(1).max(10).default(2),
      })
      .strict()
      .default({ maxAttempts: 3, initialBackoffSeconds: 60, multiplier: 2 }),
  })
  .strict();

export type DatabaseTemplateRepeat = z.infer<typeof DatabaseTemplateRepeatSchema>;

export const DatabaseTemplateSchema = z
  .object({
    id: DatabaseTemplateIdSchema,
    key: DatabaseStableKeySchema,
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional(),
    sourceId: DataSourceIdSchema,
    propertyValues: z.record(DatabasePropertyIdSchema, z.unknown()).default({}),
    body: z.string().max(1_000_000).default(''),
    order: z.number().int().min(0).max(100_000),
    archivedAt: z.string().datetime({ offset: true }).nullable().default(null),
    defaultFor: z
      .object({
        source: z.boolean().default(false),
        viewIds: z.array(DatabaseViewIdSchema).max(100).default([]),
        entryPoints: z.array(DatabaseStableKeySchema).max(100).default([]),
      })
      .strict()
      .default({ source: false, viewIds: [], entryPoints: [] }),
    repeat: DatabaseTemplateRepeatSchema.optional(),
  })
  .strict();

export type DatabaseTemplate = z.infer<typeof DatabaseTemplateSchema>;

export const DatabaseAutomationScheduleSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('daily'),
      time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal('weekly'),
      weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
      time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    })
    .strict()
    .refine((value) => new Set(value.weekdays).size === value.weekdays.length, {
      message: 'Automation weekdays must be unique',
      path: ['weekdays'],
    }),
  z
    .object({
      kind: z.literal('monthly'),
      day: z.number().int().min(1).max(28),
      time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal('interval'),
      every: z.number().int().min(1).max(365),
      unit: z.enum(['hours', 'days', 'weeks']),
      anchor: z.string().datetime({ offset: true }),
    })
    .strict(),
]);

export const DatabaseAutomationTriggerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('record_added'), sourceId: DataSourceIdSchema }).strict(),
  z
    .object({
      kind: z.literal('property_changed'),
      sourceId: DataSourceIdSchema,
      propertyId: DatabasePropertyIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('schedule'),
      schedule: DatabaseAutomationScheduleSchema,
      timeZone: z
        .string()
        .refine((value) => canonicalDatabaseTimeZone(value) !== null, 'Expected an IANA timezone'),
    })
    .strict(),
  z.object({ kind: z.literal('form_submitted'), viewId: DatabaseViewIdSchema }).strict(),
  z
    .object({
      kind: z.literal('button_invoked'),
      buttonId: DatabaseActionButtonIdSchema.optional(),
      propertyId: DatabasePropertyIdSchema.optional(),
    })
    .strict()
    .refine((value) => (value.buttonId === undefined) !== (value.propertyId === undefined), {
      message: 'A button trigger must reference exactly one database Button or Button property',
    }),
]);

const DatabaseAutomationValueSchema = z.union([
  DatabaseButtonLiteralValueSchema,
  z
    .object({
      fromEvent: z.enum(['record_id', 'record_body', 'property']),
      propertyId: DatabasePropertyIdSchema.optional(),
    })
    .strict()
    .refine((value) => (value.fromEvent === 'property') === (value.propertyId !== undefined), {
      message: 'Event property values require exactly one propertyId',
    }),
]);

const DatabaseAutomationInternalActionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      id: DatabaseStableKeySchema,
      kind: z.literal('create_record'),
      sourceId: DataSourceIdSchema,
      values: z.record(DatabasePropertyIdSchema, DatabaseAutomationValueSchema).default({}),
      body: DatabaseAutomationValueSchema.optional(),
    })
    .strict(),
  z
    .object({
      id: DatabaseStableKeySchema,
      kind: z.literal('update_trigger_record'),
      operations: z.array(DatabaseButtonMutationOperationSchema).min(1).max(100),
    })
    .strict(),
  z
    .object({
      id: DatabaseStableKeySchema,
      kind: z.literal('change_relation'),
      propertyId: DatabasePropertyIdSchema,
      operation: z.enum(['add', 'remove']),
      recordId: DatabaseRecordIdSchema,
    })
    .strict(),
  z
    .object({
      id: DatabaseStableKeySchema,
      kind: z.literal('assign_person'),
      propertyId: DatabasePropertyIdSchema,
      operation: z.enum(['set', 'add', 'remove']),
      personId: DatabasePersonIdSchema,
    })
    .strict(),
  z
    .object({
      id: DatabaseStableKeySchema,
      kind: z.literal('notification'),
      recipientIds: z.array(DatabasePersonIdSchema).min(1).max(100),
      title: z.string().trim().min(1).max(200),
      body: z.string().max(10_000).default(''),
    })
    .strict(),
  z
    .object({
      id: DatabaseStableKeySchema,
      kind: z.literal('apply_template'),
      templateId: DatabaseTemplateIdSchema,
    })
    .strict(),
]);

const DatabaseAutomationExternalActionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      id: DatabaseStableKeySchema,
      kind: z.literal('external_webhook'),
      connectionId: z.string().regex(/^conn_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
      eventName: DatabaseStableKeySchema,
      propertyIds: z.array(DatabasePropertyIdSchema).max(100).default([]),
      includeBody: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      id: DatabaseStableKeySchema,
      kind: z.literal('external_email'),
      connectionId: z.string().regex(/^conn_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
      to: z.array(z.string().email()).min(1).max(100),
      subject: z.string().trim().min(1).max(998),
      propertyIds: z.array(DatabasePropertyIdSchema).max(100).default([]),
      includeBody: z.boolean().default(false),
    })
    .strict(),
]);

export const DatabaseAutomationActionSchema = z.union([
  DatabaseAutomationInternalActionSchema,
  DatabaseAutomationExternalActionSchema,
]);

export const DatabaseAutomationSchema = z
  .object({
    id: DatabaseAutomationIdSchema,
    key: DatabaseStableKeySchema,
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional(),
    version: z.number().int().min(1),
    enabled: z.boolean().default(false),
    ownerId: DatabasePersonIdSchema,
    trigger: DatabaseAutomationTriggerSchema,
    actions: z.array(DatabaseAutomationActionSchema).min(1).max(20),
    retry: z
      .object({
        maxAttempts: z.number().int().min(1).max(10).default(3),
        initialBackoffSeconds: z.number().int().min(1).max(86_400).default(60),
        multiplier: z.number().min(1).max(10).default(2),
      })
      .strict()
      .default({ maxAttempts: 3, initialBackoffSeconds: 60, multiplier: 2 }),
    limits: z
      .object({
        maxActionsPerRun: z.number().int().min(1).max(20).default(20),
        maxGeneratedEvents: z.number().int().min(0).max(100).default(20),
      })
      .strict()
      .default({ maxActionsPerRun: 20, maxGeneratedEvents: 20 }),
  })
  .strict()
  .superRefine((automation, context) => {
    const actionIds = new Set<string>();
    let externalSeen = false;
    automation.actions.forEach((action, index) => {
      if (actionIds.has(action.id)) {
        context.addIssue({
          code: 'custom',
          path: ['actions', index, 'id'],
          message: `Automation action id "${action.id}" is duplicated`,
        });
      }
      actionIds.add(action.id);
      const external = action.kind === 'external_webhook' || action.kind === 'external_email';
      if (!external && externalSeen) {
        context.addIssue({
          code: 'custom',
          path: ['actions', index],
          message: 'Internal automation actions cannot follow an external action',
        });
      }
      externalSeen ||= external;
    });
    if (automation.limits.maxActionsPerRun < automation.actions.length) {
      context.addIssue({
        code: 'custom',
        path: ['limits', 'maxActionsPerRun'],
        message: 'maxActionsPerRun cannot be lower than the declared action count',
      });
    }
  });

export type DatabaseAutomationSchedule = z.infer<typeof DatabaseAutomationScheduleSchema>;
export type DatabaseAutomationTrigger = z.infer<typeof DatabaseAutomationTriggerSchema>;
export type DatabaseAutomationAction = z.infer<typeof DatabaseAutomationActionSchema>;
export type DatabaseAutomation = z.infer<typeof DatabaseAutomationSchema>;

export const DatabaseDefinitionSchema = z
  .object({
    version: z.literal(DATABASE_MANIFEST_CURRENT_VERSION),
    id: DatabaseIdSchema,
    key: DatabaseStableKeySchema,
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional(),
    aliases: z.array(z.string().trim().min(1).max(200)).default([]),
    people: z.array(DatabasePersonSchema).default([]),
    contract: DatabaseMachineContractSchema,
    sources: z.array(DatabaseSourceSchema).min(1),
    sourceMappings: z.array(DatabaseSourceMappingSchema).optional(),
    views: z.array(DatabaseViewSchema).default([]),
    templates: z.array(DatabaseTemplateSchema).default([]),
    buttons: z.array(DatabaseActionButtonSchema).default([]),
    automations: z.array(DatabaseAutomationSchema).default([]),
  })
  .strict()
  .superRefine((database, ctx) => {
    const sourceIds = new Set<string>();
    const sourceKeys = new Set<string>();
    const propertyIds = new Set<string>();
    const optionIds = new Set<string>();
    const statusGroupIds = new Set<string>();
    const viewIds = new Set<string>();
    const viewKeys = new Set<string>();
    const personIds = new Set<string>();
    const personKeys = new Set<string>();
    const personSubjects = new Set<string>();
    const templateIds = new Set<string>();
    const templateKeys = new Set<string>();
    const buttonIds = new Set<string>();
    const buttonKeys = new Set<string>();
    const automationIds = new Set<string>();
    const automationKeys = new Set<string>();

    for (const [personIndex, person] of database.people.entries()) {
      if (personIds.has(person.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['people', personIndex, 'id'],
          message: `Duplicate person id "${person.id}"`,
        });
      }
      if (personKeys.has(person.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['people', personIndex, 'key'],
          message: `Duplicate person key "${person.key}"`,
        });
      }
      if (person.subjectId && personSubjects.has(person.subjectId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['people', personIndex, 'subjectId'],
          message: `Runtime subject "${person.subjectId}" is linked more than once`,
        });
      }
      personIds.add(person.id);
      personKeys.add(person.key);
      if (person.subjectId) personSubjects.add(person.subjectId);
    }

    for (const [sourceIndex, source] of database.sources.entries()) {
      if (sourceIds.has(source.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sources', sourceIndex, 'id'],
          message: `Duplicate source id "${source.id}"`,
        });
      }
      if (sourceKeys.has(source.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sources', sourceIndex, 'key'],
          message: `Duplicate source key "${source.key}"`,
        });
      }
      sourceIds.add(source.id);
      sourceKeys.add(source.key);

      for (const [propertyIndex, property] of source.properties.entries()) {
        if (propertyIds.has(property.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['sources', sourceIndex, 'properties', propertyIndex, 'id'],
            message: `Property id "${property.id}" must be unique across the database`,
          });
        }
        propertyIds.add(property.id);

        if (property.type === 'person' && property.semantics.defaultValue !== undefined) {
          const defaults = property.semantics.defaultValue;
          if (Array.isArray(defaults)) {
            defaults.forEach((personKey, defaultIndex) => {
              const person = database.people.find((candidate) => candidate.key === personKey);
              if (!person) {
                ctx.addIssue({
                  code: 'custom',
                  path: [
                    'sources',
                    sourceIndex,
                    'properties',
                    propertyIndex,
                    'semantics',
                    'defaultValue',
                    defaultIndex,
                  ],
                  message: `Person default "${String(personKey)}" is not declared`,
                });
              } else if (!person.active) {
                ctx.addIssue({
                  code: 'custom',
                  path: [
                    'sources',
                    sourceIndex,
                    'properties',
                    propertyIndex,
                    'semantics',
                    'defaultValue',
                    defaultIndex,
                  ],
                  message: `Inactive person "${person.key}" cannot be a default`,
                });
              }
            });
          }
        }

        if (
          property.type === 'select' ||
          property.type === 'status' ||
          property.type === 'multi_select'
        ) {
          for (const [optionIndex, option] of property.options.entries()) {
            if (optionIds.has(option.id)) {
              ctx.addIssue({
                code: 'custom',
                path: [
                  'sources',
                  sourceIndex,
                  'properties',
                  propertyIndex,
                  'options',
                  optionIndex,
                  'id',
                ],
                message: `Option id "${option.id}" must be unique across the database`,
              });
            }
            optionIds.add(option.id);
          }
        }
        if (property.type === 'status') {
          for (const [groupIndex, group] of property.groups.entries()) {
            if (statusGroupIds.has(group.id)) {
              ctx.addIssue({
                code: 'custom',
                path: [
                  'sources',
                  sourceIndex,
                  'properties',
                  propertyIndex,
                  'groups',
                  groupIndex,
                  'id',
                ],
                message: `Status group id "${group.id}" must be unique across the database`,
              });
            }
            statusGroupIds.add(group.id);
          }
        }
      }
    }

    const sourceMappingPairs = new Set<string>();
    for (const [mappingIndex, mapping] of (database.sourceMappings ?? []).entries()) {
      const path = ['sourceMappings', mappingIndex];
      const source = database.sources.find((candidate) => candidate.id === mapping.sourceId);
      const target = database.sources.find((candidate) => candidate.id === mapping.targetSourceId);
      const pair = `${mapping.sourceId}\0${mapping.targetSourceId}`;
      if (mapping.sourceId === mapping.targetSourceId) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'targetSourceId'],
          message: 'A source mapping must target a different source',
        });
      }
      if (!source) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'sourceId'],
          message: `Source mapping origin "${mapping.sourceId}" is not defined`,
        });
      }
      if (!target) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'targetSourceId'],
          message: `Source mapping target "${mapping.targetSourceId}" is not defined`,
        });
      }
      if (sourceMappingPairs.has(pair)) {
        ctx.addIssue({
          code: 'custom',
          path,
          message: `Duplicate directed source mapping from "${mapping.sourceId}" to "${mapping.targetSourceId}"`,
        });
      }
      sourceMappingPairs.add(pair);
      if (!source || !target) continue;

      const mappedSourceProperties = new Set<string>();
      const mappedTargetProperties = new Set<string>();
      for (const [propertyMappingIndex, propertyMapping] of mapping.propertyMappings.entries()) {
        const propertyPath = [...path, 'propertyMappings', propertyMappingIndex];
        const sourceProperty = source.properties.find(
          (property) => property.id === propertyMapping.sourcePropertyId,
        );
        const targetProperty = target.properties.find(
          (property) => property.id === propertyMapping.targetPropertyId,
        );
        if (!sourceProperty) {
          ctx.addIssue({
            code: 'custom',
            path: [...propertyPath, 'sourcePropertyId'],
            message: `Mapped source property "${propertyMapping.sourcePropertyId}" is not defined in source "${source.id}"`,
          });
        }
        if (!targetProperty) {
          ctx.addIssue({
            code: 'custom',
            path: [...propertyPath, 'targetPropertyId'],
            message: `Mapped target property "${propertyMapping.targetPropertyId}" is not defined in source "${target.id}"`,
          });
        }
        if (mappedSourceProperties.has(propertyMapping.sourcePropertyId)) {
          ctx.addIssue({
            code: 'custom',
            path: [...propertyPath, 'sourcePropertyId'],
            message: `Source property "${propertyMapping.sourcePropertyId}" is mapped more than once`,
          });
        }
        if (mappedTargetProperties.has(propertyMapping.targetPropertyId)) {
          ctx.addIssue({
            code: 'custom',
            path: [...propertyPath, 'targetPropertyId'],
            message: `Target property "${propertyMapping.targetPropertyId}" is mapped more than once`,
          });
        }
        mappedSourceProperties.add(propertyMapping.sourcePropertyId);
        mappedTargetProperties.add(propertyMapping.targetPropertyId);
        if (!sourceProperty || !targetProperty) continue;
        if (sourceProperty.type !== targetProperty.type) {
          ctx.addIssue({
            code: 'custom',
            path: propertyPath,
            message: `Mapped properties must have the same type; found ${sourceProperty.type} and ${targetProperty.type}`,
          });
          continue;
        }

        const optionType =
          sourceProperty.type === 'select' ||
          sourceProperty.type === 'status' ||
          sourceProperty.type === 'multi_select';
        if (!optionType && propertyMapping.optionMappings.length > 0) {
          ctx.addIssue({
            code: 'custom',
            path: [...propertyPath, 'optionMappings'],
            message: `Option mappings do not apply to ${sourceProperty.type} properties`,
          });
          continue;
        }
        if (optionType && 'options' in targetProperty) {
          const mappedSourceOptions = new Set<string>();
          const mappedTargetOptions = new Set<string>();
          for (const [
            optionMappingIndex,
            optionMapping,
          ] of propertyMapping.optionMappings.entries()) {
            const optionPath = [...propertyPath, 'optionMappings', optionMappingIndex];
            if (
              !sourceProperty.options.some((option) => option.id === optionMapping.sourceOptionId)
            ) {
              ctx.addIssue({
                code: 'custom',
                path: [...optionPath, 'sourceOptionId'],
                message: `Mapped source option "${optionMapping.sourceOptionId}" is not defined`,
              });
            }
            if (
              !targetProperty.options.some((option) => option.id === optionMapping.targetOptionId)
            ) {
              ctx.addIssue({
                code: 'custom',
                path: [...optionPath, 'targetOptionId'],
                message: `Mapped target option "${optionMapping.targetOptionId}" is not defined`,
              });
            }
            if (mappedSourceOptions.has(optionMapping.sourceOptionId)) {
              ctx.addIssue({
                code: 'custom',
                path: [...optionPath, 'sourceOptionId'],
                message: `Source option "${optionMapping.sourceOptionId}" is mapped more than once`,
              });
            }
            if (mappedTargetOptions.has(optionMapping.targetOptionId)) {
              ctx.addIssue({
                code: 'custom',
                path: [...optionPath, 'targetOptionId'],
                message: `Target option "${optionMapping.targetOptionId}" is mapped more than once`,
              });
            }
            mappedSourceOptions.add(optionMapping.sourceOptionId);
            mappedTargetOptions.add(optionMapping.targetOptionId);
          }
        }
      }

      const sourceTitle = source.properties.find((property) => property.type === 'title');
      const targetTitle = target.properties.find((property) => property.type === 'title');
      if (
        !sourceTitle ||
        !targetTitle ||
        !mapping.propertyMappings.some(
          (propertyMapping) =>
            propertyMapping.sourcePropertyId === sourceTitle.id &&
            propertyMapping.targetPropertyId === targetTitle.id,
        )
      ) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'propertyMappings'],
          message: 'A compatible source mapping must map the source Title to the target Title',
        });
      }
      for (const targetProperty of target.properties) {
        if (
          targetProperty.required &&
          targetProperty.semantics.defaultValue === undefined &&
          !mappedTargetProperties.has(targetProperty.id)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'propertyMappings'],
            message: `Required target property "${targetProperty.id}" must be mapped or define a default`,
          });
        }
      }
    }

    for (const [sourceIndex, source] of database.sources.entries()) {
      for (const [propertyIndex, property] of source.properties.entries()) {
        if (property.type === 'relation') {
          if (!sourceIds.has(property.targetSourceId)) {
            ctx.addIssue({
              code: 'custom',
              path: ['sources', sourceIndex, 'properties', propertyIndex, 'targetSourceId'],
              message: `Relation target source "${property.targetSourceId}" is not defined`,
            });
          }
          if (property.pairedPropertyId) {
            const targetSource = database.sources.find(
              (candidate) => candidate.id === property.targetSourceId,
            );
            const pairedProperty = targetSource?.properties.find(
              (candidate) => candidate.id === property.pairedPropertyId,
            );
            const pairPath = [
              'sources',
              sourceIndex,
              'properties',
              propertyIndex,
              'pairedPropertyId',
            ];
            if (!pairedProperty) {
              ctx.addIssue({
                code: 'custom',
                path: pairPath,
                message: `Paired relation property "${property.pairedPropertyId}" is not defined in target source "${property.targetSourceId}"`,
              });
            } else if (pairedProperty.type !== 'relation') {
              ctx.addIssue({
                code: 'custom',
                path: pairPath,
                message: `Paired property "${property.pairedPropertyId}" must be a relation`,
              });
            } else if (
              pairedProperty.targetSourceId !== source.id ||
              pairedProperty.pairedPropertyId !== property.id
            ) {
              ctx.addIssue({
                code: 'custom',
                path: pairPath,
                message: `Paired relation "${property.pairedPropertyId}" must target source "${source.id}" and point back to "${property.id}"`,
              });
            }
          }
        } else if (property.type === 'button') {
          const basePath = ['sources', sourceIndex, 'properties', propertyIndex, 'actions'];
          let externalActionSeen = false;
          for (const [actionIndex, action] of property.actions.entries()) {
            if (action.kind === 'external_webhook') {
              externalActionSeen = true;
              for (const [payloadIndex, payloadPropertyId] of action.propertyIds.entries()) {
                if (!source.properties.some((candidate) => candidate.id === payloadPropertyId)) {
                  ctx.addIssue({
                    code: 'custom',
                    path: [...basePath, actionIndex, 'propertyIds', payloadIndex],
                    message: `Webhook payload property "${payloadPropertyId}" is not defined in source "${source.id}"`,
                  });
                }
              }
              continue;
            }
            if (externalActionSeen) {
              ctx.addIssue({
                code: 'custom',
                path: [...basePath, actionIndex],
                message: 'External webhook actions must run after every database action',
              });
            }
            if (action.kind === 'update_record') {
              for (const [operationIndex, operation] of action.operations.entries()) {
                if (operation.op === 'append' && operation.propertyId === undefined) continue;
                const target = source.properties.find(
                  (candidate) => candidate.id === operation.propertyId,
                );
                if (!target) {
                  ctx.addIssue({
                    code: 'custom',
                    path: [...basePath, actionIndex, 'operations', operationIndex, 'propertyId'],
                    message: `Button mutation property "${String(operation.propertyId)}" is not defined in source "${source.id}"`,
                  });
                } else if (
                  target.type === 'formula' ||
                  target.type === 'rollup' ||
                  target.type === 'created_time' ||
                  target.type === 'last_edited_time' ||
                  target.type === 'created_by' ||
                  target.type === 'last_edited_by' ||
                  target.type === 'button' ||
                  target.type === 'unique_id'
                ) {
                  ctx.addIssue({
                    code: 'custom',
                    path: [...basePath, actionIndex, 'operations', operationIndex, 'propertyId'],
                    message: `Button cannot mutate read-only property "${target.id}"`,
                  });
                } else {
                  let message: string | null = null;
                  if (
                    operation.op === 'set' &&
                    !isValidButtonActionValue(target, operation.value)
                  ) {
                    message = `Button set value is incompatible with ${target.type} property "${target.id}"`;
                  } else if (operation.op === 'unset' && target.required) {
                    message = `Button cannot unset required property "${target.id}"`;
                  } else if (operation.op === 'increment' && target.type !== 'number') {
                    message = `Button increment requires a number property; found ${target.type}`;
                  } else if (
                    operation.op === 'append' &&
                    target.type !== 'title' &&
                    target.type !== 'text'
                  ) {
                    message = `Button append requires a title or text property; found ${target.type}`;
                  } else if (operation.op === 'add' || operation.op === 'remove') {
                    if (
                      target.type !== 'multi_select' &&
                      target.type !== 'person' &&
                      target.type !== 'files'
                    ) {
                      message = `Button ${operation.op} requires a multi-select, person, or files property; found ${target.type}`;
                    } else if (
                      (target.type === 'multi_select' || target.type === 'person') &&
                      typeof operation.value !== 'string'
                    ) {
                      message = `Button ${operation.op} requires one stable string ID for ${target.type}`;
                    } else if (
                      target.type === 'files' &&
                      operation.op === 'add' &&
                      typeof operation.value === 'string'
                    ) {
                      message = 'Button file add requires one declared file object';
                    }
                  } else if (
                    (operation.op === 'link' || operation.op === 'unlink') &&
                    target.type !== 'relation'
                  ) {
                    message = `Button ${operation.op} requires a relation property; found ${target.type}`;
                  }
                  if (message) {
                    ctx.addIssue({
                      code: 'custom',
                      path: [...basePath, actionIndex, 'operations', operationIndex],
                      message,
                    });
                  }
                }
              }
            } else if (action.kind === 'create_record') {
              const targetSource = database.sources.find(
                (candidate) => candidate.id === action.sourceId,
              );
              if (!targetSource) {
                ctx.addIssue({
                  code: 'custom',
                  path: [...basePath, actionIndex, 'sourceId'],
                  message: `Button create target source "${action.sourceId}" is not defined`,
                });
                continue;
              }
              for (const propertyId of Object.keys(action.values)) {
                const target = targetSource.properties.find(
                  (candidate) => candidate.id === propertyId,
                );
                if (!target) {
                  ctx.addIssue({
                    code: 'custom',
                    path: [...basePath, actionIndex, 'values', propertyId],
                    message: `Button create value property "${propertyId}" is not defined in source "${targetSource.id}"`,
                  });
                } else if (
                  target.type === 'formula' ||
                  target.type === 'rollup' ||
                  target.type === 'created_time' ||
                  target.type === 'last_edited_time' ||
                  target.type === 'created_by' ||
                  target.type === 'last_edited_by' ||
                  target.type === 'button'
                ) {
                  ctx.addIssue({
                    code: 'custom',
                    path: [...basePath, actionIndex, 'values', propertyId],
                    message: `Button cannot set read-only property "${target.id}"`,
                  });
                } else if (!isValidButtonActionValue(target, action.values[propertyId])) {
                  ctx.addIssue({
                    code: 'custom',
                    path: [...basePath, actionIndex, 'values', propertyId],
                    message: `Button create value is incompatible with ${target.type} property "${target.id}"`,
                  });
                }
              }
              for (const target of targetSource.properties) {
                if (
                  target.required &&
                  action.values[target.id] === undefined &&
                  target.semantics.defaultValue === undefined
                ) {
                  ctx.addIssue({
                    code: 'custom',
                    path: [...basePath, actionIndex, 'values'],
                    message: `Button create action is missing required property "${target.id}"`,
                  });
                }
              }
            }
          }
        } else if (property.type === 'formula') {
          for (const dependencyId of collectFormulaPropertyDependencies(property.ast)) {
            if (!propertyIds.has(dependencyId)) {
              ctx.addIssue({
                code: 'custom',
                path: ['sources', sourceIndex, 'properties', propertyIndex, 'ast'],
                message: `Formula dependency "${dependencyId}" is not defined in this database`,
              });
            }
          }
        } else if (property.type === 'rollup') {
          const relation = source.properties.find(
            (candidate) => candidate.id === property.relationPropertyId,
          );
          const basePath = ['sources', sourceIndex, 'properties', propertyIndex];
          if (!relation || relation.type !== 'relation') {
            ctx.addIssue({
              code: 'custom',
              path: [...basePath, 'relationPropertyId'],
              message: `Rollup relation "${property.relationPropertyId}" must be a relation in source "${source.id}"`,
            });
            continue;
          }
          const targetSource = database.sources.find(
            (candidate) => candidate.id === relation.targetSourceId,
          );
          const target = targetSource?.properties.find(
            (candidate) => candidate.id === property.targetPropertyId,
          );
          if (!target) {
            ctx.addIssue({
              code: 'custom',
              path: [...basePath, 'targetPropertyId'],
              message: `Rollup target "${property.targetPropertyId}" is not defined in relation source "${relation.targetSourceId}"`,
            });
            continue;
          }
          const actual = computedValueType(target);
          if (
            property.targetValueType !== actual.valueType ||
            property.targetItemType !== actual.itemType
          ) {
            ctx.addIssue({
              code: 'custom',
              path: [...basePath, 'targetValueType'],
              message: `Rollup target type must match ${actual.valueType}${actual.itemType ? `<${actual.itemType}>` : ''}`,
            });
          }
          const projectedType = actual.valueType === 'list' ? actual.itemType : actual.valueType;
          if (
            (property.function === 'sum' ||
              property.function === 'average' ||
              property.function === 'min' ||
              property.function === 'max') &&
            projectedType !== 'number'
          ) {
            ctx.addIssue({
              code: 'custom',
              path: [...basePath, 'function'],
              message: `Rollup function "${property.function}" requires number values`,
            });
          }
          if (
            (property.function === 'earliest' || property.function === 'latest') &&
            projectedType !== 'date'
          ) {
            ctx.addIssue({
              code: 'custom',
              path: [...basePath, 'function'],
              message: `Rollup function "${property.function}" requires date values`,
            });
          }
        }
      }
    }

    const computedProperties: FormulaComputedPropertyInput[] = [];
    for (const source of database.sources) {
      for (const property of source.properties) {
        if (property.type === 'formula') {
          computedProperties.push({
            propertyId: property.id,
            sourceId: source.id,
            kind: 'formula',
            ast: property.ast,
          });
        } else if (property.type === 'rollup') {
          computedProperties.push({
            propertyId: property.id,
            sourceId: source.id,
            kind: 'rollup',
            dependencies: [property.relationPropertyId, property.targetPropertyId],
          });
        }
      }
    }
    try {
      buildFormulaDependencyGraph(computedProperties);
    } catch (error) {
      if (error instanceof FormulaDependencyError) {
        ctx.addIssue({
          code: 'custom',
          path: ['sources'],
          message: error.message,
          params: { code: error.code, ...error.details },
        });
      }
    }

    for (const [viewIndex, view] of database.views.entries()) {
      if (viewIds.has(view.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['views', viewIndex, 'id'],
          message: `Duplicate view id "${view.id}"`,
        });
      }
      if (viewKeys.has(view.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['views', viewIndex, 'key'],
          message: `Duplicate view key "${view.key}"`,
        });
      }
      viewIds.add(view.id);
      viewKeys.add(view.key);

      const source = database.sources.find((candidate) => candidate.id === view.sourceId);
      if (!source) {
        ctx.addIssue({
          code: 'custom',
          path: ['views', viewIndex, 'sourceId'],
          message: `View source "${view.sourceId}" is not defined`,
        });
        continue;
      }
      const propertyIds = new Set(source.properties.map((property) => property.id));
      const references = [
        ...view.sort.map((item) => item.propertyId),
        ...view.groups.map((item) => item.propertyId),
        ...view.projection.propertyIds,
        ...(view.layout.type === 'table'
          ? Object.keys(view.layout.configuration.propertyWidths ?? {})
          : []),
        ...(view.layout.type === 'board' && view.layout.configuration.cardPreview.type === 'files'
          ? [view.layout.configuration.cardPreview.propertyId]
          : []),
        ...(view.layout.type === 'timeline'
          ? [
              ...(view.layout.configuration.dateMapping.type === 'range'
                ? [view.layout.configuration.dateMapping.propertyId]
                : [
                    view.layout.configuration.dateMapping.startPropertyId,
                    view.layout.configuration.dateMapping.endPropertyId,
                  ]),
              ...(view.layout.configuration.dependencyPropertyId
                ? [view.layout.configuration.dependencyPropertyId]
                : []),
            ]
          : []),
        ...(view.layout.type === 'calendar' ? [view.layout.configuration.datePropertyId] : []),
        ...(view.layout.type === 'list' &&
        view.layout.configuration.hierarchy.type === 'parent_relation'
          ? [view.layout.configuration.hierarchy.propertyId]
          : []),
        ...(view.layout.type === 'gallery' && view.layout.configuration.cardPreview.type === 'files'
          ? [view.layout.configuration.cardPreview.propertyId]
          : []),
        ...(view.layout.type === 'chart'
          ? [
              ...(view.layout.configuration.dimension
                ? [view.layout.configuration.dimension.propertyId]
                : []),
              ...(view.layout.configuration.seriesPropertyId
                ? [view.layout.configuration.seriesPropertyId]
                : []),
              ...(view.layout.configuration.measure.type === 'property'
                ? [view.layout.configuration.measure.propertyId]
                : []),
            ]
          : []),
        ...(view.layout.type === 'form'
          ? [
              ...view.layout.configuration.questions.map((question) => question.propertyId),
              ...Object.keys(view.layout.configuration.defaults),
              ...(view.layout.configuration.duplicateSubmission.type === 'reject_property'
                ? [view.layout.configuration.duplicateSubmission.propertyId]
                : []),
            ]
          : []),
        ...(view.layout.type === 'map' ? [view.layout.configuration.placePropertyId] : []),
        ...(view.where ? collectFilterPropertyIds(view.where) : []),
        ...view.conditionalColors.flatMap((rule) => [
          ...collectFilterPropertyIds(rule.where),
          ...(rule.applyTo.type === 'property' ? [rule.applyTo.propertyId] : []),
        ]),
        ...(view.agent?.writePolicy.allowedPropertyIds ?? []),
      ];
      for (const propertyId of new Set(references)) {
        if (!propertyIds.has(propertyId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['views', viewIndex],
            message: `View references property "${propertyId}" outside source "${view.sourceId}"`,
          });
        }
      }
      const boardConfiguration =
        view.layout.type === 'board' ? view.layout.configuration : undefined;
      const cardPreview = boardConfiguration?.cardPreview;
      if (cardPreview?.type === 'files') {
        const previewProperty = source.properties.find(
          (property) => property.id === cardPreview.propertyId,
        );
        if (previewProperty && previewProperty.type !== 'files') {
          ctx.addIssue({
            code: 'custom',
            path: ['views', viewIndex, 'layout', 'configuration', 'cardPreview'],
            message: 'A Board files preview must reference a Files property',
          });
        }
      }
      const timelineConfiguration =
        view.layout.type === 'timeline' ? view.layout.configuration : undefined;
      if (timelineConfiguration) {
        const mapping = timelineConfiguration.dateMapping;
        const datePropertyIds =
          mapping.type === 'range'
            ? [mapping.propertyId]
            : [mapping.startPropertyId, mapping.endPropertyId];
        for (const propertyId of datePropertyIds) {
          const property = source.properties.find((candidate) => candidate.id === propertyId);
          if (property && property.type !== 'date') {
            ctx.addIssue({
              code: 'custom',
              path: ['views', viewIndex, 'layout', 'configuration', 'dateMapping'],
              message: 'Timeline date mapping must reference Date properties',
            });
          }
        }
        const dependencyProperty = timelineConfiguration.dependencyPropertyId
          ? source.properties.find(
              (candidate) => candidate.id === timelineConfiguration.dependencyPropertyId,
            )
          : undefined;
        if (
          dependencyProperty &&
          (dependencyProperty.type !== 'relation' ||
            dependencyProperty.targetSourceId !== source.id)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['views', viewIndex, 'layout', 'configuration', 'dependencyPropertyId'],
            message: 'Timeline dependencies must use a Relation targeting the same source',
          });
        }
      }
      const calendarConfiguration =
        view.layout.type === 'calendar'
          ? (view.layout.configuration as DatabaseCalendarViewConfiguration)
          : undefined;
      if (calendarConfiguration) {
        const dateProperty = source.properties.find(
          (candidate) => candidate.id === calendarConfiguration.datePropertyId,
        );
        if (dateProperty && dateProperty.type !== 'date') {
          ctx.addIssue({
            code: 'custom',
            path: ['views', viewIndex, 'layout', 'configuration', 'datePropertyId'],
            message: 'Calendar date mapping must reference a Date property',
          });
        }
      }
      const listConfiguration =
        view.layout.type === 'list'
          ? (view.layout.configuration as DatabaseListViewConfiguration)
          : undefined;
      if (listConfiguration?.hierarchy.type === 'parent_relation') {
        const parentPropertyId = listConfiguration.hierarchy.propertyId;
        const parentProperty = source.properties.find(
          (candidate) => candidate.id === parentPropertyId,
        );
        if (
          parentProperty &&
          (parentProperty.type !== 'relation' || parentProperty.targetSourceId !== source.id)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['views', viewIndex, 'layout', 'configuration', 'hierarchy'],
            message: 'List hierarchy must use a Relation targeting the same source',
          });
        }
      }
      const galleryConfiguration =
        view.layout.type === 'gallery'
          ? (view.layout.configuration as DatabaseGalleryViewConfiguration)
          : undefined;
      if (galleryConfiguration?.cardPreview.type === 'files') {
        const previewPropertyId = galleryConfiguration.cardPreview.propertyId;
        const previewProperty = source.properties.find(
          (property) => property.id === previewPropertyId,
        );
        if (previewProperty && previewProperty.type !== 'files') {
          ctx.addIssue({
            code: 'custom',
            path: ['views', viewIndex, 'layout', 'configuration', 'cardPreview'],
            message: 'A Gallery files preview must reference a Files property',
          });
        }
      }
      const chartConfiguration =
        view.layout.type === 'chart'
          ? (view.layout.configuration as DatabaseChartViewConfiguration)
          : undefined;
      if (chartConfiguration) {
        const unsupportedDimensionTypes = new Set<DatabasePropertyType>([
          'button',
          'files',
          'place',
          'rollup',
        ]);
        for (const [path, propertyId] of [
          ['dimension', chartConfiguration.dimension?.propertyId],
          ['seriesPropertyId', chartConfiguration.seriesPropertyId],
        ] as const) {
          if (!propertyId) continue;
          const property = source.properties.find((candidate) => candidate.id === propertyId);
          if (property && unsupportedDimensionTypes.has(property.type)) {
            ctx.addIssue({
              code: 'custom',
              path: ['views', viewIndex, 'layout', 'configuration', path],
              message: `Chart dimensions do not support ${property.type} properties`,
            });
          }
        }
        if (chartConfiguration.measure.type === 'property') {
          const measure = chartConfiguration.measure;
          const measureProperty = source.properties.find(
            (candidate) => candidate.id === measure.propertyId,
          );
          const numericFunction = !['count_values', 'count_unique'].includes(measure.function);
          if (measureProperty && numericFunction && measureProperty.type !== 'number') {
            ctx.addIssue({
              code: 'custom',
              path: ['views', viewIndex, 'layout', 'configuration', 'measure'],
              message: `${measure.function} requires a Number property`,
            });
          }
        }
      }
      const formConfiguration = view.layout.type === 'form' ? view.layout.configuration : undefined;
      if (formConfiguration) {
        const readOnlyTypes = new Set<DatabasePropertyType>([
          'formula',
          'rollup',
          'created_time',
          'last_edited_time',
          'created_by',
          'last_edited_by',
          'button',
          'unique_id',
        ]);
        const mappedPropertyIds = new Set([
          ...formConfiguration.questions.map((question) => question.propertyId),
          ...Object.keys(formConfiguration.defaults),
        ]);
        for (const [questionIndex, question] of formConfiguration.questions.entries()) {
          const property = source.properties.find(
            (candidate) => candidate.id === question.propertyId,
          );
          if (property && readOnlyTypes.has(property.type)) {
            ctx.addIssue({
              code: 'custom',
              path: ['views', viewIndex, 'layout', 'configuration', 'questions', questionIndex],
              message: `Forms cannot write ${property.type} property "${property.id}"`,
            });
          }
          if (property?.type === 'files' && !formConfiguration.fileUploads.enabled) {
            ctx.addIssue({
              code: 'custom',
              path: ['views', viewIndex, 'layout', 'configuration', 'fileUploads'],
              message: 'Form file uploads must be enabled before adding a Files question',
            });
          }
        }
        for (const [propertyId, value] of Object.entries(formConfiguration.defaults)) {
          const property = source.properties.find((candidate) => candidate.id === propertyId);
          if (property && !isDatabaseValueValidForProperty(property, value)) {
            ctx.addIssue({
              code: 'custom',
              path: ['views', viewIndex, 'layout', 'configuration', 'defaults', propertyId],
              message: `Form default is incompatible with ${property.type} property "${property.id}"`,
            });
          }
        }
        for (const property of source.properties) {
          if (
            (property.type === 'title' || property.required) &&
            !mappedPropertyIds.has(property.id) &&
            property.semantics.defaultValue === undefined
          ) {
            ctx.addIssue({
              code: 'custom',
              path: ['views', viewIndex, 'layout', 'configuration', 'questions'],
              message: `Form must map required property "${property.id}"`,
            });
          }
        }
        if (formConfiguration.duplicateSubmission.type === 'reject_property') {
          const duplicatePropertyId = formConfiguration.duplicateSubmission.propertyId;
          const duplicateProperty = source.properties.find(
            (candidate) => candidate.id === duplicatePropertyId,
          );
          if (
            duplicateProperty &&
            !['title', 'text', 'url', 'email', 'phone', 'number'].includes(duplicateProperty.type)
          ) {
            ctx.addIssue({
              code: 'custom',
              path: ['views', viewIndex, 'layout', 'configuration', 'duplicateSubmission'],
              message: 'Duplicate rejection requires a scalar text or number property',
            });
          }
          if (duplicateProperty && !mappedPropertyIds.has(duplicateProperty.id)) {
            ctx.addIssue({
              code: 'custom',
              path: ['views', viewIndex, 'layout', 'configuration', 'duplicateSubmission'],
              message: 'Duplicate rejection property must be mapped by the form',
            });
          }
        }
      }
      const mapConfiguration = view.layout.type === 'map' ? view.layout.configuration : undefined;
      if (mapConfiguration) {
        const placeProperty = source.properties.find(
          (candidate) => candidate.id === mapConfiguration.placePropertyId,
        );
        if (placeProperty && placeProperty.type !== 'place') {
          ctx.addIssue({
            code: 'custom',
            path: ['views', viewIndex, 'layout', 'configuration', 'placePropertyId'],
            message: 'Map location mapping must reference a Place property',
          });
        }
        if (
          placeProperty?.type === 'place' &&
          mapConfiguration.basemap === 'openstreetmap' &&
          placeProperty.externalMap !== 'explicit'
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['views', viewIndex, 'layout', 'configuration', 'basemap'],
            message:
              'OpenStreetMap tiles require explicit external map access on the Place property',
          });
        }
      }
      const feedConfiguration = view.layout.type === 'feed' ? view.layout.configuration : undefined;
      if (feedConfiguration) {
        const chronology = source?.properties.find(
          (property) => property.id === feedConfiguration.chronologyPropertyId,
        );
        if (
          !chronology ||
          !['date', 'created_time', 'last_edited_time'].includes(chronology.type)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['views', viewIndex, 'layout', 'configuration', 'chronologyPropertyId'],
            message:
              'Feed chronology must reference a Date, Created time, or Last edited time property',
          });
        }
        if (feedConfiguration.authorPropertyId) {
          const author = source?.properties.find(
            (property) => property.id === feedConfiguration.authorPropertyId,
          );
          if (!author || !['person', 'created_by', 'last_edited_by'].includes(author.type)) {
            ctx.addIssue({
              code: 'custom',
              path: ['views', viewIndex, 'layout', 'configuration', 'authorPropertyId'],
              message:
                'Feed author must reference a Person, Created by, or Last edited by property',
            });
          }
        }
        const chronologySort = view.sort[0];
        if (
          !chronologySort ||
          chronologySort.propertyId !== feedConfiguration.chronologyPropertyId ||
          chronologySort.direction !== 'desc'
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['views', viewIndex, 'sort', 0],
            message: 'Feed views must sort their chronology property descending first',
          });
        }
      }
      const dashboardConfiguration =
        view.layout.type === 'dashboard' ? view.layout.configuration : undefined;
      if (dashboardConfiguration) {
        const widgetViews = new Map<string, DatabaseView>();
        for (const [rowIndex, row] of dashboardConfiguration.rows.entries()) {
          for (const [widgetIndex, widget] of row.widgets.entries()) {
            const widgetView = database.views.find((candidate) => candidate.id === widget.viewId);
            if (!widgetView) {
              ctx.addIssue({
                code: 'custom',
                path: [
                  'views',
                  viewIndex,
                  'layout',
                  'configuration',
                  'rows',
                  rowIndex,
                  'widgets',
                  widgetIndex,
                  'viewId',
                ],
                message: `Dashboard widget view "${widget.viewId}" is not defined`,
              });
              continue;
            }
            if (['dashboard', 'form', 'agent'].includes(widgetView.layout.type)) {
              ctx.addIssue({
                code: 'custom',
                path: [
                  'views',
                  viewIndex,
                  'layout',
                  'configuration',
                  'rows',
                  rowIndex,
                  'widgets',
                  widgetIndex,
                  'viewId',
                ],
                message: `Dashboard widgets do not support ${widgetView.layout.type} views`,
              });
            }
            widgetViews.set(widget.id, widgetView);
          }
        }
        for (const [filterIndex, filter] of dashboardConfiguration.globalFilters.entries()) {
          for (const [clauseIndex, clause] of filter.clauses.entries()) {
            const filterSource = database.sources.find(
              (candidate) => candidate.id === clause.sourceId,
            );
            if (!filterSource) {
              ctx.addIssue({
                code: 'custom',
                path: [
                  'views',
                  viewIndex,
                  'layout',
                  'configuration',
                  'globalFilters',
                  filterIndex,
                  'clauses',
                  clauseIndex,
                  'sourceId',
                ],
                message: `Dashboard filter source "${clause.sourceId}" is not defined`,
              });
              continue;
            }
            const filterPropertyIds = new Set(collectFilterPropertyIds(clause.where));
            for (const propertyId of filterPropertyIds) {
              if (!filterSource.properties.some((property) => property.id === propertyId)) {
                ctx.addIssue({
                  code: 'custom',
                  path: [
                    'views',
                    viewIndex,
                    'layout',
                    'configuration',
                    'globalFilters',
                    filterIndex,
                    'clauses',
                    clauseIndex,
                    'where',
                  ],
                  message: `Dashboard filter references property "${propertyId}" outside source "${clause.sourceId}"`,
                });
              }
            }
          }
        }
        for (const [
          interactionIndex,
          interaction,
        ] of dashboardConfiguration.interactions.entries()) {
          const sourceWidgetView = widgetViews.get(interaction.sourceWidgetId);
          const targetWidgetView = widgetViews.get(interaction.targetWidgetId);
          const targetSource = targetWidgetView
            ? database.sources.find((candidate) => candidate.id === targetWidgetView.sourceId)
            : undefined;
          const relationProperty = targetSource?.properties.find(
            (property) => property.id === interaction.targetRelationPropertyId,
          );
          if (
            sourceWidgetView &&
            targetWidgetView &&
            (!relationProperty ||
              relationProperty.type !== 'relation' ||
              relationProperty.targetSourceId !== sourceWidgetView.sourceId)
          ) {
            ctx.addIssue({
              code: 'custom',
              path: [
                'views',
                viewIndex,
                'layout',
                'configuration',
                'interactions',
                interactionIndex,
                'targetRelationPropertyId',
              ],
              message:
                'Dashboard linked interactions require a target Relation pointing to the source widget data source',
            });
          }
        }
      }
    }

    for (const [sourceIndex, source] of database.sources.entries()) {
      if (!source.defaultViewId) continue;
      const defaultView = database.views.find((view) => view.id === source.defaultViewId);
      if (!defaultView) {
        ctx.addIssue({
          code: 'custom',
          path: ['sources', sourceIndex, 'defaultViewId'],
          message: `Default view "${source.defaultViewId}" is not defined`,
        });
      } else if (defaultView.sourceId !== source.id) {
        ctx.addIssue({
          code: 'custom',
          path: ['sources', sourceIndex, 'defaultViewId'],
          message: `Default view "${source.defaultViewId}" belongs to source "${defaultView.sourceId}"`,
        });
      }
    }

    if (database.contract.defaultTimePropertyId) {
      const defaultTimeProperty = database.sources
        .flatMap((source) => source.properties)
        .find((property) => property.id === database.contract.defaultTimePropertyId);
      if (!defaultTimeProperty) {
        ctx.addIssue({
          code: 'custom',
          path: ['contract', 'defaultTimePropertyId'],
          message: `Default time property "${database.contract.defaultTimePropertyId}" is not defined`,
        });
      } else if (defaultTimeProperty.type !== 'date') {
        ctx.addIssue({
          code: 'custom',
          path: ['contract', 'defaultTimePropertyId'],
          message: `Default time property "${database.contract.defaultTimePropertyId}" must have type "date"`,
        });
      }
    }

    const sourceDefaults = new Set<string>();
    const viewDefaults = new Set<string>();
    const entryPointDefaults = new Set<string>();
    for (const [templateIndex, template] of database.templates.entries()) {
      const basePath = ['templates', templateIndex];
      const source = database.sources.find((candidate) => candidate.id === template.sourceId);
      if (templateIds.has(template.id)) {
        ctx.addIssue({
          code: 'custom',
          path: [...basePath, 'id'],
          message: `Duplicate template id "${template.id}"`,
        });
      }
      if (templateKeys.has(template.key)) {
        ctx.addIssue({
          code: 'custom',
          path: [...basePath, 'key'],
          message: `Duplicate template key "${template.key}"`,
        });
      }
      templateIds.add(template.id);
      templateKeys.add(template.key);
      if (!source) {
        ctx.addIssue({
          code: 'custom',
          path: [...basePath, 'sourceId'],
          message: `Template source "${template.sourceId}" is not defined`,
        });
        continue;
      }
      for (const [propertyId, value] of Object.entries(template.propertyValues)) {
        const property = source.properties.find((candidate) => candidate.id === propertyId);
        if (!property) {
          ctx.addIssue({
            code: 'custom',
            path: [...basePath, 'propertyValues', propertyId],
            message: `Template property "${propertyId}" is not defined in source "${source.id}"`,
          });
        } else if (!isDatabaseValueValidForProperty(property, value)) {
          ctx.addIssue({
            code: 'custom',
            path: [...basePath, 'propertyValues', propertyId],
            message: `Template value is incompatible with ${property.type} property "${property.id}"`,
          });
        }
      }
      if (
        template.archivedAt !== null &&
        (template.defaultFor.source ||
          template.defaultFor.viewIds.length > 0 ||
          template.defaultFor.entryPoints.length > 0)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: [...basePath, 'defaultFor'],
          message: 'An archived template cannot remain a default',
        });
      }
      if (template.repeat) {
        const owner = database.people.find((person) => person.id === template.repeat?.ownerId);
        if (!owner) {
          ctx.addIssue({
            code: 'custom',
            path: [...basePath, 'repeat', 'ownerId'],
            message: `Repeating-template owner "${template.repeat.ownerId}" is not defined`,
          });
        } else if (!template.repeat.paused && owner.active === false) {
          ctx.addIssue({
            code: 'custom',
            path: [...basePath, 'repeat', 'ownerId'],
            message: 'An active repeating template requires an active owner',
          });
        }
        if (template.archivedAt !== null && !template.repeat.paused) {
          ctx.addIssue({
            code: 'custom',
            path: [...basePath, 'repeat', 'paused'],
            message: 'An archived repeating template must be paused',
          });
        }
      }
      if (template.defaultFor.source) {
        if (sourceDefaults.has(source.id))
          ctx.addIssue({
            code: 'custom',
            path: [...basePath, 'defaultFor', 'source'],
            message: `Source "${source.id}" has more than one default template`,
          });
        sourceDefaults.add(source.id);
      }
      for (const viewId of template.defaultFor.viewIds) {
        const view = database.views.find((candidate) => candidate.id === viewId);
        if (!view || view.sourceId !== source.id)
          ctx.addIssue({
            code: 'custom',
            path: [...basePath, 'defaultFor', 'viewIds'],
            message: `Default view "${viewId}" is not defined for source "${source.id}"`,
          });
        if (viewDefaults.has(viewId))
          ctx.addIssue({
            code: 'custom',
            path: [...basePath, 'defaultFor', 'viewIds'],
            message: `View "${viewId}" has more than one default template`,
          });
        viewDefaults.add(viewId);
      }
      for (const entryPoint of template.defaultFor.entryPoints) {
        const scoped = `${source.id}\0${entryPoint}`;
        if (entryPointDefaults.has(scoped))
          ctx.addIssue({
            code: 'custom',
            path: [...basePath, 'defaultFor', 'entryPoints'],
            message: `Entry point "${entryPoint}" has more than one default template for source "${source.id}"`,
          });
        entryPointDefaults.add(scoped);
      }
    }

    for (const [buttonIndex, button] of database.buttons.entries()) {
      const basePath = ['buttons', buttonIndex];
      if (buttonIds.has(button.id)) {
        ctx.addIssue({
          code: 'custom',
          path: [...basePath, 'id'],
          message: `Duplicate database button id "${button.id}"`,
        });
      }
      if (buttonKeys.has(button.key)) {
        ctx.addIssue({
          code: 'custom',
          path: [...basePath, 'key'],
          message: `Duplicate database button key "${button.key}"`,
        });
      }
      buttonIds.add(button.id);
      buttonKeys.add(button.key);
      const placementSourceId =
        button.placement.kind === 'source' ? button.placement.sourceId : null;
      if (
        placementSourceId &&
        !database.sources.some((source) => source.id === placementSourceId)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: [...basePath, 'placement', 'sourceId'],
          message: `Database button source "${placementSourceId}" is not defined`,
        });
      }
      for (const [actionIndex, action] of button.actions.entries()) {
        if (action.kind !== 'create_record') continue;
        const target = database.sources.find((source) => source.id === action.sourceId);
        if (!target) {
          ctx.addIssue({
            code: 'custom',
            path: [...basePath, 'actions', actionIndex, 'sourceId'],
            message: `Database button target source "${action.sourceId}" is not defined`,
          });
          continue;
        }
        for (const [propertyId, value] of Object.entries(action.values)) {
          const property = target.properties.find((candidate) => candidate.id === propertyId);
          if (!property || !isDatabaseValueValidForProperty(property, value)) {
            ctx.addIssue({
              code: 'custom',
              path: [...basePath, 'actions', actionIndex, 'values', propertyId],
              message: `Database button value for "${propertyId}" is invalid`,
            });
          }
        }
        for (const property of target.properties) {
          if (
            property.required &&
            action.values[property.id] === undefined &&
            property.semantics.defaultValue === undefined
          ) {
            ctx.addIssue({
              code: 'custom',
              path: [...basePath, 'actions', actionIndex, 'values'],
              message: `Database button create action is missing required property "${property.id}"`,
            });
          }
        }
      }
    }

    for (const [automationIndex, automation] of database.automations.entries()) {
      const basePath = ['automations', automationIndex];
      if (automationIds.has(automation.id)) {
        ctx.addIssue({
          code: 'custom',
          path: [...basePath, 'id'],
          message: `Duplicate automation id "${automation.id}"`,
        });
      }
      if (automationKeys.has(automation.key)) {
        ctx.addIssue({
          code: 'custom',
          path: [...basePath, 'key'],
          message: `Duplicate automation key "${automation.key}"`,
        });
      }
      automationIds.add(automation.id);
      automationKeys.add(automation.key);

      const owner = database.people.find((person) => person.id === automation.ownerId);
      if (!owner) {
        ctx.addIssue({
          code: 'custom',
          path: [...basePath, 'ownerId'],
          message: `Automation owner "${automation.ownerId}" is not defined`,
        });
      } else if (automation.enabled && owner.active === false) {
        ctx.addIssue({
          code: 'custom',
          path: [...basePath, 'ownerId'],
          message: 'An enabled automation requires an active owner',
        });
      }

      let triggerSource: DatabaseDefinition['sources'][number] | undefined;
      let triggerHasRecord = false;
      if (
        automation.trigger.kind === 'record_added' ||
        automation.trigger.kind === 'property_changed'
      ) {
        const trigger = automation.trigger;
        triggerSource = database.sources.find((source) => source.id === trigger.sourceId);
        triggerHasRecord = true;
        if (!triggerSource) {
          ctx.addIssue({
            code: 'custom',
            path: [...basePath, 'trigger', 'sourceId'],
            message: `Automation trigger source "${trigger.sourceId}" is not defined`,
          });
        } else if (
          trigger.kind === 'property_changed' &&
          !triggerSource.properties.some((property) => property.id === trigger.propertyId)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: [...basePath, 'trigger', 'propertyId'],
            message: `Automation trigger property "${trigger.propertyId}" is not defined in its source`,
          });
        }
      } else if (automation.trigger.kind === 'form_submitted') {
        const trigger = automation.trigger;
        const view = database.views.find((candidate) => candidate.id === trigger.viewId);
        triggerSource = database.sources.find((source) => source.id === view?.sourceId);
        triggerHasRecord = true;
        if (!view || view.layout.type !== 'form') {
          ctx.addIssue({
            code: 'custom',
            path: [...basePath, 'trigger', 'viewId'],
            message: `Automation form trigger "${trigger.viewId}" must reference a Form view`,
          });
        }
      } else if (automation.trigger.kind === 'button_invoked') {
        const trigger = automation.trigger;
        if (trigger.buttonId) {
          const button = database.buttons.find((candidate) => candidate.id === trigger.buttonId);
          if (!button) {
            ctx.addIssue({
              code: 'custom',
              path: [...basePath, 'trigger', 'buttonId'],
              message: `Automation Button trigger "${trigger.buttonId}" is not defined`,
            });
          } else if (button.placement.kind === 'source') {
            const placement = button.placement;
            triggerSource = database.sources.find((source) => source.id === placement.sourceId);
          }
        } else if (trigger.propertyId) {
          triggerSource = database.sources.find((source) =>
            source.properties.some(
              (property) => property.id === trigger.propertyId && property.type === 'button',
            ),
          );
          triggerHasRecord = true;
          if (!triggerSource) {
            ctx.addIssue({
              code: 'custom',
              path: [...basePath, 'trigger', 'propertyId'],
              message: `Automation Button-property trigger "${trigger.propertyId}" is not defined`,
            });
          }
        }
      }

      for (const [actionIndex, action] of automation.actions.entries()) {
        const actionPath = [...basePath, 'actions', actionIndex];
        if (
          (action.kind === 'update_trigger_record' ||
            action.kind === 'change_relation' ||
            action.kind === 'assign_person') &&
          !triggerHasRecord
        ) {
          ctx.addIssue({
            code: 'custom',
            path: actionPath,
            message: `Automation action "${action.kind}" requires a record-backed trigger`,
          });
        }
        if (action.kind === 'create_record') {
          const target = database.sources.find((source) => source.id === action.sourceId);
          if (!target) {
            ctx.addIssue({
              code: 'custom',
              path: [...actionPath, 'sourceId'],
              message: `Automation target source "${action.sourceId}" is not defined`,
            });
          } else {
            for (const [propertyId, value] of Object.entries(action.values)) {
              const property = target.properties.find((candidate) => candidate.id === propertyId);
              if (!property) {
                ctx.addIssue({
                  code: 'custom',
                  path: [...actionPath, 'values', propertyId],
                  message: `Automation target property "${propertyId}" is not defined`,
                });
              } else if (
                (!value || typeof value !== 'object' || !('fromEvent' in value)) &&
                !isDatabaseValueValidForProperty(property, value)
              ) {
                ctx.addIssue({
                  code: 'custom',
                  path: [...actionPath, 'values', propertyId],
                  message: `Automation literal value for "${propertyId}" is invalid`,
                });
              }
              if (
                value &&
                typeof value === 'object' &&
                'fromEvent' in value &&
                value.fromEvent === 'property' &&
                !triggerSource?.properties.some((candidate) => candidate.id === value.propertyId)
              ) {
                ctx.addIssue({
                  code: 'custom',
                  path: [...actionPath, 'values', propertyId],
                  message: `Automation event property "${String(value.propertyId)}" is outside the trigger source`,
                });
              }
            }
          }
        } else if (action.kind === 'update_trigger_record') {
          for (const [operationIndex, operation] of action.operations.entries()) {
            if (
              operation.propertyId &&
              !triggerSource?.properties.some(
                (property) => property.id === operation.propertyId && property.type !== 'button',
              )
            ) {
              ctx.addIssue({
                code: 'custom',
                path: [...actionPath, 'operations', operationIndex, 'propertyId'],
                message: `Automation mutation property "${operation.propertyId}" is outside the trigger source`,
              });
            }
          }
        } else if (action.kind === 'change_relation') {
          const property = triggerSource?.properties.find(
            (candidate) => candidate.id === action.propertyId,
          );
          if (!property || property.type !== 'relation') {
            ctx.addIssue({
              code: 'custom',
              path: [...actionPath, 'propertyId'],
              message: `Automation relation property "${action.propertyId}" is invalid`,
            });
          }
        } else if (action.kind === 'assign_person') {
          const property = triggerSource?.properties.find(
            (candidate) => candidate.id === action.propertyId,
          );
          if (!property || property.type !== 'person') {
            ctx.addIssue({
              code: 'custom',
              path: [...actionPath, 'propertyId'],
              message: `Automation person property "${action.propertyId}" is invalid`,
            });
          }
          if (!database.people.some((person) => person.id === action.personId && person.active)) {
            ctx.addIssue({
              code: 'custom',
              path: [...actionPath, 'personId'],
              message: `Automation assignee "${action.personId}" must be active`,
            });
          }
        } else if (action.kind === 'notification') {
          for (const recipientId of action.recipientIds) {
            if (!database.people.some((person) => person.id === recipientId && person.active)) {
              ctx.addIssue({
                code: 'custom',
                path: [...actionPath, 'recipientIds'],
                message: `Automation notification recipient "${recipientId}" must be active`,
              });
            }
          }
        } else if (action.kind === 'apply_template') {
          if (!database.templates.some((template) => template.id === action.templateId)) {
            ctx.addIssue({
              code: 'custom',
              path: [...actionPath, 'templateId'],
              message: `Automation template "${action.templateId}" is not defined`,
            });
          }
        } else if (action.kind === 'external_webhook' || action.kind === 'external_email') {
          for (const propertyId of action.propertyIds) {
            if (!triggerSource?.properties.some((property) => property.id === propertyId)) {
              ctx.addIssue({
                code: 'custom',
                path: [...actionPath, 'propertyIds'],
                message: `Automation egress property "${propertyId}" is outside the trigger source`,
              });
            }
          }
          if (action.includeBody && !triggerHasRecord) {
            ctx.addIssue({
              code: 'custom',
              path: [...actionPath, 'includeBody'],
              message: 'Automation body egress requires a record-backed trigger',
            });
          }
        }
      }
    }
  });

export type DatabaseDefinition = z.infer<typeof DatabaseDefinitionSchema>;

export const DatabaseRecordActorSchema = z
  .object({
    kind: z.enum(['human', 'agent', 'sync', 'filesystem', 'system']),
    principal_id: z.string().trim().min(1).max(256),
  })
  .strict();

export type DatabaseRecordActor = z.infer<typeof DatabaseRecordActorSchema>;

export function databaseRecordActorKey(actor: DatabaseRecordActor): string {
  return `${actor.kind}|${actor.principal_id}`;
}

export function parseDatabaseRecordActorKey(value: string): DatabaseRecordActor | null {
  const separator = value.indexOf('|');
  if (separator <= 0) return null;
  const parsed = DatabaseRecordActorSchema.safeParse({
    kind: value.slice(0, separator),
    principal_id: value.slice(separator + 1),
  });
  return parsed.success ? parsed.data : null;
}

export const StoredDatabaseRecordMetadataSchema = z
  .object({
    database_id: DatabaseIdSchema,
    source_id: DataSourceIdSchema,
    record_id: DatabaseRecordIdSchema,
    created_at: z.string().datetime({ offset: true }).optional(),
    last_edited_at: z.string().datetime({ offset: true }).optional(),
    created_by: DatabaseRecordActorSchema.optional(),
    last_edited_by: DatabaseRecordActorSchema.optional(),
    archived_at: z.string().datetime({ offset: true }).optional(),
    page_layout_override: DatabaseRecordPageLayoutOverrideSchema.optional(),
  })
  .loose();

export type StoredDatabaseRecordMetadata = z.infer<typeof StoredDatabaseRecordMetadataSchema>;

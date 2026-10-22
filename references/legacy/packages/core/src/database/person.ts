import { z } from 'zod';

const DATABASE_PERSON_ID_RE = /^person_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const DATABASE_PERSON_SUBJECT_ID_RE = /^[^\s]{1,256}$/;

export const DATABASE_PERSON_KINDS = ['local', 'collaborator', 'guest', 'agent'] as const;

export const DatabasePersonIdSchema = z.string().regex(DATABASE_PERSON_ID_RE);
export const DatabasePersonKindSchema = z.enum(DATABASE_PERSON_KINDS);

const personBaseShape = {
  id: DatabasePersonIdSchema,
  key: z
    .string()
    .regex(/^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*$/)
    .max(128),
  name: z.string().trim().min(1).max(200),
  active: z.boolean().default(true),
};

/**
 * Database-scoped identity card. `subjectId` links the stable database person
 * to a runtime principal without copying email addresses or provider profile
 * payloads into manifests and query results.
 */
export const DatabasePersonSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...personBaseShape,
      kind: z.literal('local'),
      subjectId: z.string().regex(/^principal-[A-Za-z0-9_-]{1,247}$/),
    })
    .strict(),
  z
    .object({
      ...personBaseShape,
      kind: z.literal('collaborator'),
      subjectId: z.string().regex(DATABASE_PERSON_SUBJECT_ID_RE).optional(),
    })
    .strict(),
  z
    .object({
      ...personBaseShape,
      kind: z.literal('guest'),
      subjectId: z.string().regex(DATABASE_PERSON_SUBJECT_ID_RE).optional(),
    })
    .strict(),
  z
    .object({
      ...personBaseShape,
      kind: z.literal('agent'),
      subjectId: z.string().regex(DATABASE_PERSON_SUBJECT_ID_RE),
    })
    .strict(),
]);

export type DatabasePersonId = z.infer<typeof DatabasePersonIdSchema>;
export type DatabasePersonKind = z.infer<typeof DatabasePersonKindSchema>;
export type DatabasePerson = z.infer<typeof DatabasePersonSchema>;

/** Permission-safe identity metadata embedded beside projected Person values. */
export const ProjectedDatabasePersonSchema = z
  .object({
    id: DatabasePersonIdSchema,
    key: personBaseShape.key,
    name: personBaseShape.name,
    kind: DatabasePersonKindSchema,
    active: z.boolean(),
  })
  .strict();

export type ProjectedDatabasePerson = z.infer<typeof ProjectedDatabasePersonSchema>;

export function projectDatabasePerson(person: DatabasePerson): ProjectedDatabasePerson {
  return {
    id: person.id,
    key: person.key,
    name: person.name,
    kind: person.kind,
    active: person.active,
  };
}

export function findDatabasePersonByReference(
  people: readonly DatabasePerson[],
  reference: unknown,
): DatabasePerson | null {
  if (typeof reference !== 'string') return null;
  const stable = people.find((person) => person.id === reference || person.key === reference);
  if (stable) return stable;
  const exactNames = people.filter((person) => person.name === reference);
  return exactNames.length === 1 ? (exactNames[0] ?? null) : null;
}

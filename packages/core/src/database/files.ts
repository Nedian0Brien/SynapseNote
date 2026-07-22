import { z } from 'zod';

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

/**
 * A local database file always addresses one content-root-relative asset.
 * The value deliberately stores no availability flag: availability is
 * observed at read/preview time so a restored or deleted file cannot leave a
 * stale status behind in Markdown.
 */
export function isSafeDatabaseAssetPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_048) return false;
  if (value !== value.trim() || value.includes('\\') || hasControlCharacter(value)) {
    return false;
  }
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

export function isSafeDatabaseExternalFileUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 8_192) return false;
  if (value !== value.trim() || hasControlCharacter(value)) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

const optionalFileText = (maximum: number) => z.string().trim().min(1).max(maximum).optional();

export const DatabaseLocalFileValueSchema = z
  .object({
    kind: z.literal('local'),
    path: z.string().refine(isSafeDatabaseAssetPath, {
      message: 'Local file path must be a safe content-root-relative path',
    }),
    name: optionalFileText(255),
    caption: optionalFileText(2_000),
  })
  .strict();

export const DatabaseExternalFileValueSchema = z
  .object({
    kind: z.literal('external'),
    url: z.string().refine(isSafeDatabaseExternalFileUrl, {
      message: 'External file URL must be an HTTP or HTTPS URL without credentials',
    }),
    name: optionalFileText(255),
    caption: optionalFileText(2_000),
  })
  .strict();

export const DatabaseFileValueSchema = z.discriminatedUnion('kind', [
  DatabaseLocalFileValueSchema,
  DatabaseExternalFileValueSchema,
]);

export type DatabaseFileValue = z.infer<typeof DatabaseFileValueSchema>;
export type DatabaseLocalFileValue = z.infer<typeof DatabaseLocalFileValueSchema>;
export type DatabaseExternalFileValue = z.infer<typeof DatabaseExternalFileValueSchema>;

export const DatabaseFileAvailabilitySchema = z.enum(['available', 'missing']);
export type DatabaseFileAvailability = z.infer<typeof DatabaseFileAvailabilitySchema>;

export function databaseFileIdentity(file: DatabaseFileValue): string {
  return file.kind === 'local' ? file.path : file.url;
}

export function databaseFileDisplayName(file: DatabaseFileValue): string {
  if (file.name) return file.name;
  const identity = databaseFileIdentity(file);
  if (file.kind === 'local') return identity.split('/').at(-1) ?? identity;
  try {
    const url = new URL(identity);
    return url.pathname.split('/').filter(Boolean).at(-1) ?? url.hostname;
  } catch {
    return identity;
  }
}

export const DatabaseFilesValueSchema = z
  .array(DatabaseFileValueSchema)
  .max(100)
  .superRefine((files, context) => {
    const identities = new Set<string>();
    files.forEach((file, index) => {
      const identity = databaseFileIdentity(file);
      if (identities.has(identity)) {
        context.addIssue({
          code: 'custom',
          path: [index],
          message: `File source "${identity}" is repeated`,
        });
      }
      identities.add(identity);
    });
  });

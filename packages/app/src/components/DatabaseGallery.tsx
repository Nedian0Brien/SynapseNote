import { Trans } from '@lingui/react/macro';
import type {
  DatabaseFileValue,
  DatabaseProperty,
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseValue,
  DatabaseView,
  ProjectedDatabasePerson,
  ProjectedDatabaseRecord,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import {
  databaseFileDisplayName,
  mediaKindForSidebarAssetExtension,
  toDesktopAssetHref,
} from '@nedian0brien/synapsenote-core';
import { Braces, ExternalLink, FileImage, ImageOff } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const GALLERY_COLORS = {
  gray: 'bg-gray-500/15',
  brown: 'bg-amber-900/15',
  orange: 'bg-orange-500/15',
  yellow: 'bg-yellow-400/20',
  green: 'bg-green-500/15',
  blue: 'bg-blue-500/15',
  purple: 'bg-purple-500/15',
  pink: 'bg-pink-500/15',
  red: 'bg-red-500/15',
} as const;

const FALLBACK_COLORS = [
  'from-blue-500/30 to-cyan-500/10',
  'from-purple-500/30 to-pink-500/10',
  'from-emerald-500/30 to-lime-500/10',
  'from-orange-500/30 to-yellow-500/10',
] as const;

type Preview =
  | { kind: 'image'; file: Extract<DatabaseFileValue, { kind: 'local' }>; href: string }
  | {
      kind: 'fallback';
      reason: 'none' | 'empty' | 'external' | 'unsupported' | 'missing' | 'error';
    };

function stableColorIndex(value: string): number {
  return [...value].reduce((sum, character) => sum + (character.codePointAt(0) ?? 0), 0) % 4;
}

function galleryPreview(input: {
  files: readonly DatabaseFileValue[];
  fileStates: DatabaseQueryResult['fileStates'];
  failed: ReadonlySet<string>;
}): Preview {
  if (input.files.length === 0) return { kind: 'fallback', reason: 'empty' };
  let reason: Extract<Preview, { kind: 'fallback' }>['reason'] = 'unsupported';
  for (const file of input.files) {
    if (file.kind === 'external') {
      reason = 'external';
      continue;
    }
    const extension = file.path.split('.').pop() ?? '';
    if (mediaKindForSidebarAssetExtension(extension) !== 'image') continue;
    if (input.fileStates?.[file.path] === 'missing') {
      reason = 'missing';
      continue;
    }
    if (input.failed.has(file.path)) {
      reason = 'error';
      continue;
    }
    return {
      kind: 'image',
      file,
      href: toDesktopAssetHref(`/api/asset?path=${encodeURIComponent(file.path)}`),
    };
  }
  return { kind: 'fallback', reason };
}

function recordTitle(source: DatabaseSource, record: ProjectedDatabaseRecord): string {
  const title = source.properties.find((property) => property.type === 'title');
  return title ? String(record.values[title.id] ?? 'Untitled') : 'Untitled';
}

function propertyLabel(
  property: DatabaseProperty,
  value: DatabaseValue | undefined,
  people: readonly ProjectedDatabasePerson[],
  relationRecords: readonly ProjectedDatabaseRelationRecord[],
): string {
  if (value === undefined || value === null || value === '') return '—';
  if (
    property.type === 'select' ||
    property.type === 'multi_select' ||
    property.type === 'status'
  ) {
    const values = Array.isArray(value) ? value : [value];
    return values
      .map((item) => property.options.find((option) => option.id === item)?.name ?? String(item))
      .join(', ');
  }
  if (
    property.type === 'person' ||
    property.type === 'created_by' ||
    property.type === 'last_edited_by'
  ) {
    const values = Array.isArray(value) ? value : [value];
    return values
      .map((item) => people.find((person) => person.id === item)?.name ?? String(item))
      .join(', ');
  }
  if (property.type === 'relation') {
    const values = Array.isArray(value) ? value : [value];
    return values
      .map((item) => relationRecords.find((record) => record.id === item)?.title ?? String(item))
      .join(', ');
  }
  if (property.type === 'files' && Array.isArray(value)) {
    return (value as DatabaseFileValue[]).map(databaseFileDisplayName).join(', ');
  }
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function DatabaseGallery({
  source,
  view,
  result,
  people = result.people ?? [],
  relationRecords = result.relationRecords ?? [],
  onOpen,
  onOpenContextInspector,
}: {
  source: DatabaseSource;
  view: DatabaseView;
  result: DatabaseQueryResult;
  people?: readonly ProjectedDatabasePerson[];
  relationRecords?: readonly ProjectedDatabaseRelationRecord[];
  onOpen?: (record: ProjectedDatabaseRecord) => void;
  onOpenContextInspector?: (record: ProjectedDatabaseRecord) => void;
}) {
  'use no memo';
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  if (view.layout.type !== 'gallery') return null;
  const configuration = view.layout.configuration;
  const titleProperty = source.properties.find((property) => property.type === 'title');
  const previewPropertyId =
    configuration.cardPreview.type === 'files' ? configuration.cardPreview.propertyId : undefined;
  const previewProperty = previewPropertyId
    ? source.properties.find(
        (property) => property.id === previewPropertyId && property.type === 'files',
      )
    : undefined;
  if (configuration.cardPreview.type === 'files' && !previewProperty) {
    return (
      <div
        className="rounded border border-destructive/30 p-4 text-destructive text-sm"
        role="alert"
      >
        <Trans>This Gallery view has an invalid Files preview.</Trans>
      </div>
    );
  }
  const properties = view.projection.propertyIds
    .map((id) => source.properties.find((property) => property.id === id))
    .filter(
      (property): property is DatabaseProperty =>
        property !== undefined &&
        property.id !== titleProperty?.id &&
        property.id !== previewProperty?.id,
    );
  const colorRules = new Map(
    (result.conditionalColors?.rules ?? []).map((rule) => [rule.id, rule]),
  );
  const minimumWidth =
    configuration.cardSize === 'small'
      ? '10rem'
      : configuration.cardSize === 'large'
        ? '20rem'
        : '14rem';
  const previewHeight =
    configuration.cardSize === 'small'
      ? 'h-28'
      : configuration.cardSize === 'large'
        ? 'h-56'
        : 'h-40';

  return (
    <section aria-label={`${view.name} Gallery`} data-database-gallery>
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minimumWidth}), 1fr))`,
        }}
      >
        {result.records.map((record) => {
          const files =
            previewProperty && Array.isArray(record.values[previewProperty.id])
              ? (record.values[previewProperty.id] as DatabaseFileValue[])
              : [];
          const preview =
            configuration.cardPreview.type === 'none'
              ? ({ kind: 'fallback', reason: 'none' } as const)
              : galleryPreview({ files, fileStates: result.fileStates, failed: failedImages });
          const colorMatch = result.conditionalColors?.records[record.id];
          const pageColor = colorMatch?.pageRuleId
            ? colorRules.get(colorMatch.pageRuleId)?.color
            : undefined;
          return (
            <article
              key={record.id}
              className={cn(
                'group overflow-hidden rounded-lg border bg-background shadow-sm transition-shadow hover:shadow-md',
                pageColor ? GALLERY_COLORS[pageColor] : undefined,
              )}
              data-gallery-card={record.id}
              data-conditional-color={pageColor}
            >
              <div className={cn('relative overflow-hidden bg-muted', previewHeight)}>
                {preview.kind === 'image' ? (
                  <img
                    src={preview.href}
                    alt={preview.file.caption ?? preview.file.name ?? recordTitle(source, record)}
                    className={cn(
                      'size-full bg-muted',
                      configuration.fitImage ? 'object-contain' : 'object-cover',
                    )}
                    loading="lazy"
                    decoding="async"
                    onError={() =>
                      setFailedImages((current) => new Set(current).add(preview.file.path))
                    }
                  />
                ) : (
                  <div
                    className={cn(
                      'flex size-full flex-col items-center justify-center gap-2 text-muted-foreground',
                      configuration.fallbackStyle === 'color' &&
                        `bg-gradient-to-br ${FALLBACK_COLORS[stableColorIndex(record.id)]}`,
                    )}
                    data-gallery-fallback={preview.reason}
                  >
                    {preview.reason === 'external' ||
                    preview.reason === 'missing' ||
                    preview.reason === 'error' ? (
                      <ImageOff className="size-8" />
                    ) : (
                      <FileImage className="size-8" />
                    )}
                    <span className="text-xs">
                      {preview.reason === 'external'
                        ? 'External media not loaded'
                        : preview.reason === 'missing'
                          ? 'Local image missing'
                          : preview.reason === 'error'
                            ? 'Image could not load'
                            : preview.reason === 'unsupported'
                              ? 'No supported image'
                              : 'No preview'}
                    </span>
                  </div>
                )}
              </div>
              <div className="space-y-2 p-3">
                {configuration.showTitle ? (
                  <div className="flex items-start gap-1">
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto min-w-0 flex-1 justify-start p-0 text-left font-medium"
                      data-record-title-link={record.id}
                      onClick={() => onOpen?.(record)}
                    >
                      {recordTitle(source, record)}
                    </Button>
                    {onOpen ? <ExternalLink className="mt-1 size-3 text-muted-foreground" /> : null}
                    {onOpenContextInspector ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Inspect context for record ${record.id}`}
                        onClick={() => onOpenContextInspector(record)}
                      >
                        <Braces aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {properties.map((property) => {
                  const ruleId = colorMatch?.propertyRuleIds?.[property.id];
                  const propertyColor = ruleId ? colorRules.get(ruleId)?.color : undefined;
                  return (
                    <div
                      key={property.id}
                      className={cn(
                        'flex gap-2 text-xs',
                        propertyColor ? GALLERY_COLORS[propertyColor] : undefined,
                      )}
                      data-gallery-property={property.id}
                      data-conditional-color={propertyColor}
                    >
                      <span className="text-muted-foreground">{property.name}</span>
                      <span className="ml-auto min-w-0 truncate">
                        {propertyLabel(
                          property,
                          record.values[property.id],
                          people,
                          relationRecords,
                        )}
                      </span>
                    </div>
                  );
                })}
                {!configuration.showTitle && onOpen ? (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-w-0 flex-1"
                      aria-label={`Open ${recordTitle(source, record)}`}
                      onClick={() => onOpen(record)}
                    >
                      <ExternalLink /> <Trans>Open</Trans>
                    </Button>
                    {onOpenContextInspector ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Inspect context for record ${record.id}`}
                        onClick={() => onOpenContextInspector(record)}
                      >
                        <Braces aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {!configuration.showTitle && !onOpen && onOpenContextInspector ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    aria-label={`Inspect context for record ${record.id}`}
                    onClick={() => onOpenContextInspector(record)}
                  >
                    <Braces aria-hidden="true" /> <Trans>Inspect context</Trans>
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {result.records.length === 0 ? (
        <p className="rounded border border-dashed p-8 text-center text-muted-foreground text-sm">
          <Trans>No records in this gallery.</Trans>
        </p>
      ) : null}
    </section>
  );
}

import { Trans } from '@lingui/react/macro';
import { AlertCircle, FileText, Link2, MapPin, Paperclip, Pencil, UserRound } from 'lucide-react';
import { isDatabaseCellEditable } from '@/lib/database-cell-mutation';
import { dispatchExternalLinkClick, openExternalUrl } from '@/lib/external-link';
import { cn } from '@/lib/utils';
import type { DatabaseTableCellContentProps } from './DatabaseTableCellContent';
import { DatabaseValueCopyButton } from './DatabaseValueCopyButton';
import {
  databaseInlineFileValues,
  databaseInlineOptionColorClass,
  databaseInlinePersonValues,
  databaseInlineRelationValues,
  databaseLinkHref,
  databasePlaceMapHref,
} from './database-table-utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';

export type DatabaseTableCellDisplayContentProps = Omit<
  DatabaseTableCellContentProps,
  'editing' | 'cellEditing' | 'cellPresence' | 'setEditing' | 'onSaveEdit' | 'onCancelEdit'
>;

function databaseCellIsEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function EmptyCellTarget() {
  return (
    <span
      aria-hidden="true"
      className="inline-block min-h-4 min-w-3 align-middle"
      data-database-empty-cell
    />
  );
}

/** Read-only display families. Editors and mutation lifecycle stay in the dispatcher. */
export function DatabaseTableCellDisplayContent({
  property,
  record,
  people,
  relationRecords,
  fileStates,
  personLabels,
  missingFileLabel,
  notionSurface,
  mutationLocked,
  ghostCreated,
  recordLabel,
  proposed,
  proposedRecord,
  shownValue,
  shownText,
  computedResult,
  verificationProjection,
  onEdit,
  onInvokeButton,
  onVerificationAction,
  onOpen,
  onBeginEdit,
}: DatabaseTableCellDisplayContentProps) {
  const linkHref = databaseLinkHref(property, shownValue);
  const invalidValue = record.invalidValues?.[property.id];
  const emptyCell =
    invalidValue === undefined && computedResult === undefined && databaseCellIsEmpty(shownValue);
  const displayedText = emptyCell ? <EmptyCellTarget /> : shownText;
  const recordActionLabel = (action: string) =>
    `${action} ${notionSurface ? 'page' : 'record'} ${recordLabel}`;

  return (
    <>
      {computedResult?.kind === 'error' ? (
        <span
          className="inline-flex max-w-full items-center gap-1 text-destructive"
          role="status"
          aria-label={shownText}
        >
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{computedResult.problem.code}</span>
        </span>
      ) : linkHref ? (
        <div className="flex min-w-0 items-center gap-1">
          <a
            href={linkHref}
            target={property.type === 'url' ? '_blank' : undefined}
            rel={property.type === 'url' ? 'noopener noreferrer' : undefined}
            className="min-w-0 truncate text-azure-blue underline underline-offset-2"
            aria-label={`Open ${property.name} for ${notionSurface ? 'page' : 'record'} ${recordLabel}`}
            onClick={(event) => dispatchExternalLinkClick(event, linkHref)}
            onAuxClick={(event) => {
              if (event.button === 1) dispatchExternalLinkClick(event, linkHref);
            }}
          >
            {String(shownValue)}
          </a>
          <DatabaseValueCopyButton
            value={String(shownValue)}
            label={`${property.name} for ${notionSurface ? 'page' : 'record'} ${recordLabel}`}
            className={
              notionSurface
                ? 'opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100'
                : undefined
            }
          />
          {onEdit && !ghostCreated ? (
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={mutationLocked || proposed}
              className={
                notionSurface
                  ? 'opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100'
                  : undefined
              }
              aria-label={`Edit ${property.name} for ${notionSurface ? 'page' : 'record'} ${recordLabel}`}
              onClick={() => onBeginEdit(record, property)}
            >
              <Pencil />
            </Button>
          ) : null}
        </div>
      ) : property.type === 'button' && !ghostCreated ? (
        <Button
          variant="outline"
          size="sm"
          disabled={mutationLocked || proposed || !onInvokeButton}
          aria-label={`${property.label} for ${notionSurface ? 'page' : 'record'} ${recordLabel}`}
          onClick={() => onInvokeButton?.(record, property)}
        >
          {property.label}
        </Button>
      ) : property.type === 'verification' && !ghostCreated ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <Badge
            variant={
              verificationProjection?.status === 'verified'
                ? 'primary'
                : verificationProjection?.status === 'expired' ||
                    verificationProjection?.status === 'stale'
                  ? 'warning'
                  : 'gray'
            }
            title={
              verificationProjection?.verifiedBy
                ? `${verificationProjection.status} · ${verificationProjection.verifiedBy.kind} · ${verificationProjection.verifiedBy.principal_id}`
                : 'unverified'
            }
          >
            {shownText}
          </Badge>
          {onVerificationAction ? (
            verificationProjection?.storedState === 'verified' ? (
              <>
                {property.allowExpiry ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={mutationLocked || proposed}
                    onClick={() => onVerificationAction(record, property, 'renew')}
                  >
                    <Trans>Renew</Trans>
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={mutationLocked || proposed}
                  onClick={() => onVerificationAction(record, property, 'unverify')}
                >
                  <Trans>Unverify</Trans>
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={mutationLocked || proposed || !record.evidenceRevision}
                onClick={() => onVerificationAction(record, property, 'verify')}
              >
                <Trans>Verify</Trans>
              </Button>
            )
          ) : null}
        </div>
      ) : property.type === 'place' &&
        property.externalMap === 'explicit' &&
        databasePlaceMapHref(shownValue) ? (
        <div className="flex min-w-0 items-center gap-1">
          {isDatabaseCellEditable(property) && onEdit && !ghostCreated ? (
            <Button
              variant="ghost"
              disabled={mutationLocked || proposed}
              className="h-auto min-w-0 justify-start px-1 py-0.5 font-inherit"
              aria-label={`Edit ${property.name} for ${notionSurface ? 'page' : 'record'} ${recordLabel}`}
              onClick={() => onBeginEdit(record, property)}
            >
              <span className="truncate">{shownText}</span>
            </Button>
          ) : (
            <span className="truncate">{shownText}</span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Open ${property.name} in OpenStreetMap; shares stored coordinates`}
            title="OpenStreetMap receives the stored coordinates only after this click"
            onClick={() => {
              const href = databasePlaceMapHref(shownValue);
              if (href) openExternalUrl(href);
            }}
          >
            <MapPin aria-hidden="true" />
          </Button>
        </div>
      ) : notionSurface && property.type === 'checkbox' ? (
        <Checkbox
          checked={shownValue === true}
          disabled={mutationLocked || proposed || !onEdit}
          aria-label={`Toggle ${property.name} for page ${recordLabel}`}
          data-database-inline-checkbox={property.id}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={(checked) => {
            onEdit?.(record, property, checked === true);
          }}
        />
      ) : notionSurface &&
        (property.type === 'select' ||
          property.type === 'status' ||
          property.type === 'multi_select') ? (
        (() => {
          const tagValues = (Array.isArray(shownValue) ? shownValue : [shownValue]).filter(
            (value) => value !== undefined && value !== null && value !== '',
          );
          const tags = (
            <div className="flex min-w-0 flex-wrap gap-1">
              {tagValues.map((value) => {
                const option = property.options.find((candidate) => candidate.id === String(value));
                return (
                  <span
                    key={String(value)}
                    className={cn(
                      'inline-flex max-w-full items-center rounded-full border border-transparent px-2 py-0.5 font-sans text-xs normal-case tracking-normal',
                      databaseInlineOptionColorClass(option?.color),
                    )}
                    title={option?.name ?? String(value)}
                    data-database-property-tag={property.id}
                    data-database-property-tag-option={String(value)}
                  >
                    <span className="truncate">{option?.name ?? String(value)}</span>
                  </span>
                );
              })}
            </div>
          );
          if (onEdit && !ghostCreated) {
            return (
              <Button
                type="button"
                variant="ghost"
                disabled={mutationLocked || proposed}
                className="h-auto max-w-full justify-start px-1 py-0.5 font-inherit"
                aria-label={`Edit ${property.name} for page ${recordLabel}: ${tagValues.length > 0 ? tagValues.map((value) => property.options.find((option) => option.id === String(value))?.name ?? String(value)).join(', ') : 'empty'}`}
                onClick={() => onBeginEdit(record, property)}
              >
                {tagValues.length > 0 ? tags : <EmptyCellTarget />}
              </Button>
            );
          }
          return tagValues.length > 0 ? tags : <EmptyCellTarget />;
        })()
      ) : notionSurface && property.type === 'relation' ? (
        (() => {
          const relationValues = databaseInlineRelationValues(shownValue, relationRecords);
          const relationTags =
            relationValues.length > 0 ? (
              <span className="flex min-w-0 flex-wrap gap-1">
                {relationValues.map((relation) => (
                  <span
                    key={relation.id}
                    className={cn(
                      'inline-flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-muted/60 px-1.5 py-0.5 font-sans text-xs normal-case tracking-normal',
                      !relation.available && 'border-dashed text-muted-foreground italic',
                    )}
                    title={relation.label}
                    data-database-property-relation={property.id}
                    data-database-property-relation-id={relation.id}
                  >
                    <Link2 className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{relation.label}</span>
                  </span>
                ))}
              </span>
            ) : (
              <EmptyCellTarget />
            );
          return onEdit && !ghostCreated ? (
            <Button
              variant="ghost"
              disabled={mutationLocked || proposed}
              className="h-auto max-w-full justify-start px-1 py-0.5 font-inherit"
              aria-label={`Edit ${property.name} for page ${recordLabel}: ${relationValues.length > 0 ? relationValues.map((relation) => relation.label).join(', ') : 'empty'}`}
              onClick={() => onBeginEdit(record, property)}
            >
              {relationTags}
            </Button>
          ) : (
            relationTags
          );
        })()
      ) : notionSurface && property.type === 'person' ? (
        (() => {
          const personValues = databaseInlinePersonValues(shownValue, people, personLabels);
          const personTags =
            personValues.length > 0 ? (
              <span className="flex min-w-0 flex-wrap gap-1">
                {personValues.map((person) => (
                  <span
                    key={person.id}
                    className={cn(
                      'inline-flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-muted/60 px-1.5 py-0.5 font-sans text-xs normal-case tracking-normal',
                      !person.available && 'border-dashed text-muted-foreground italic',
                    )}
                    title={person.label}
                    data-database-property-person={property.id}
                    data-database-property-person-id={person.id}
                  >
                    <UserRound className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{person.label}</span>
                  </span>
                ))}
              </span>
            ) : (
              <EmptyCellTarget />
            );
          return onEdit && !ghostCreated ? (
            <Button
              variant="ghost"
              disabled={mutationLocked || proposed}
              className="h-auto max-w-full justify-start px-1 py-0.5 font-inherit"
              aria-label={`Edit ${property.name} for page ${recordLabel}: ${personValues.length > 0 ? personValues.map((person) => person.label).join(', ') : 'empty'}`}
              onClick={() => onBeginEdit(record, property)}
            >
              {personTags}
            </Button>
          ) : (
            personTags
          );
        })()
      ) : notionSurface && property.type === 'files' ? (
        (() => {
          const fileValues = databaseInlineFileValues(shownValue, fileStates, missingFileLabel);
          const fileTags =
            fileValues.length > 0 ? (
              <span className="flex min-w-0 flex-wrap gap-1">
                {fileValues.map((file) => (
                  <span
                    key={file.id}
                    className={cn(
                      'inline-flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-muted/60 px-1.5 py-0.5 font-sans text-xs normal-case tracking-normal',
                      !file.available && 'border-dashed text-muted-foreground italic',
                    )}
                    title={file.label}
                    data-database-property-file={property.id}
                    data-database-property-file-id={file.id}
                  >
                    <Paperclip className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{file.label}</span>
                  </span>
                ))}
              </span>
            ) : (
              <EmptyCellTarget />
            );
          return onEdit && !ghostCreated ? (
            <Button
              variant="ghost"
              disabled={mutationLocked || proposed}
              className="h-auto max-w-full justify-start px-1 py-0.5 font-inherit"
              aria-label={`Edit ${property.name} for page ${recordLabel}: ${fileValues.length > 0 ? fileValues.map((file) => file.label).join(', ') : 'empty'}`}
              onClick={() => onBeginEdit(record, property)}
            >
              {fileTags}
            </Button>
          ) : (
            fileTags
          );
        })()
      ) : property.type === 'title' ? (
        <div
          className="flex min-w-0 max-w-full items-center gap-1 overflow-hidden"
          data-title-cell-content
        >
          {onOpen ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={proposedRecord !== undefined}
              className="size-5 shrink-0 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              aria-label={recordActionLabel('Open')}
              data-record-title-link={record.id}
              data-record-title-open={record.id}
              onClick={(event) => {
                event.stopPropagation();
                onOpen(record);
              }}
            >
              <FileText className="size-3.5 shrink-0" aria-hidden="true" />
            </Button>
          ) : notionSurface ? (
            <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : null}
          {onEdit && !ghostCreated ? (
            <Button
              type="button"
              variant="ghost"
              disabled={mutationLocked || proposed}
              className="h-auto min-w-0 max-w-full flex-1 justify-start truncate rounded-none px-0 py-0 text-left font-inherit font-medium text-foreground text-sm hover:bg-transparent hover:text-foreground disabled:opacity-100"
              aria-label={`Edit ${property.name} for ${notionSurface ? 'page' : 'record'} ${recordLabel}`}
              onClick={() => onBeginEdit(record, property)}
            >
              <span className="truncate">{displayedText}</span>
            </Button>
          ) : (
            <span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
              {displayedText}
            </span>
          )}
        </div>
      ) : isDatabaseCellEditable(property) && onEdit && !ghostCreated ? (
        <Button
          variant="ghost"
          disabled={mutationLocked || proposed}
          className="h-auto max-w-full justify-start px-1 py-0.5 font-inherit"
          aria-label={`Edit ${property.name} for ${notionSurface ? 'page' : 'record'} ${recordLabel}`}
          onClick={() => onBeginEdit(record, property)}
        >
          {invalidValue !== undefined ? (
            <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          ) : null}
          <span
            className={cn(
              property.type === 'text' ? 'line-clamp-3 whitespace-pre-wrap text-left' : 'truncate',
            )}
          >
            {displayedText}
          </span>
        </Button>
      ) : (
        displayedText
      )}
    </>
  );
}

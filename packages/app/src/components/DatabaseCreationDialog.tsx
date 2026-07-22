import { Trans } from '@lingui/react/macro';
import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';
import { FileSpreadsheet, FolderOpen, LayoutTemplate, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  createBlankDatabaseDesiredState,
  createDelimitedDatabaseDesiredState,
  createExistingFolderDatabaseDesiredState,
  createTemplateDatabaseDesiredState,
  DATABASE_CREATION_TEMPLATES,
  type DatabaseCreationSummary,
  type DatabaseCreationTemplateKey,
  summarizeDatabaseCreation,
} from '@/lib/database-creation';
import { parseDelimited } from '@/lib/database-csv';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

type CreationMode = 'blank' | 'template' | 'folder' | 'csv';
export type DatabaseCreationCloseReason = 'cancel' | 'submit';

function detectedDelimiter(contents: string, filename: string): ',' | '\t' | ';' {
  const candidates: Array<',' | '\t' | ';'> = filename.toLowerCase().endsWith('.tsv')
    ? ['\t', ',', ';']
    : [',', '\t', ';'];
  let best: { delimiter: ',' | '\t' | ';'; width: number } | null = null;
  for (const delimiter of candidates) {
    try {
      const width = parseDelimited(contents, delimiter)[0]?.length ?? 0;
      if (width > 0 && (!best || width > best.width)) best = { delimiter, width };
    } catch {
      // Try the next supported delimiter.
    }
  }
  if (!best) throw new Error('Unable to detect a valid CSV or TSV delimiter');
  return best.delimiter;
}

function previewValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.map(previewValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function DatabaseCreationDialog({
  open,
  onOpenChange,
  onCreate,
  presentation = 'dialog',
}: {
  open: boolean;
  onOpenChange: (open: boolean, reason?: DatabaseCreationCloseReason) => void;
  onCreate: (desiredState: DatabaseDesiredStateDraftInput, mode: CreationMode) => void;
  presentation?: 'dialog' | 'page';
}) {
  const [mode, setMode] = useState<CreationMode>('blank');
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const [includeSubfolders, setIncludeSubfolders] = useState(true);
  const [template, setTemplate] = useState<DatabaseCreationTemplateKey>('tasks');
  const [file, setFile] = useState<{ name: string; contents: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open]);

  // The blank path follows the document-native expectation: a title is useful
  // but not a prerequisite for getting an editable database surface. Keep the
  // generated name deterministic so a cancelled/retried creation cannot leave
  // an ambiguous canonical key behind.
  const prepareDesiredState = () =>
    mode === 'blank'
      ? createBlankDatabaseDesiredState({ name: name.trim() || 'Untitled database' })
      : mode === 'template'
        ? createTemplateDatabaseDesiredState({ name, template })
        : mode === 'folder'
          ? createExistingFolderDatabaseDesiredState({ name, folder, includeSubfolders })
          : file
            ? createDelimitedDatabaseDesiredState({
                name,
                contents: file.contents,
                delimiter: detectedDelimiter(file.contents, file.name),
              })
            : (() => {
                throw new Error('Choose a CSV or TSV file');
              })();

  let summary: DatabaseCreationSummary | null = null;
  let preparedState: DatabaseDesiredStateDraftInput | null = null;
  if (mode === 'blank' || name.trim()) {
    try {
      preparedState = prepareDesiredState();
      summary = summarizeDatabaseCreation(preparedState);
    } catch {
      // Incomplete mode-specific input is explained by its field and submit validation.
    }
  }

  const submit = () => {
    try {
      const desiredState = prepareDesiredState();
      onCreate(desiredState, mode);
      onOpenChange(false, 'submit');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to prepare database creation');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => onOpenChange(nextOpen, nextOpen ? undefined : 'cancel')}
    >
      <DialogContent
        showOverlay={presentation !== 'page'}
        onPointerDownOutside={
          presentation === 'page' ? (event) => event.preventDefault() : undefined
        }
        className={cn(
          presentation === 'page'
            ? 'fixed inset-0 z-40 h-[100dvh] max-h-none max-w-none sm:max-w-none translate-x-0 translate-y-0 rounded-none bg-background p-0 text-foreground'
            : 'sm:max-w-2xl',
        )}
        data-database-creation-surface=""
        data-database-creation-presentation={presentation}
      >
        <DialogHeader className={cn(presentation === 'page' && 'border-b px-6 py-5 sm:px-10')}>
          <DialogTitle>
            {presentation === 'page' ? <Trans>New database</Trans> : <Trans>Create database</Trans>}
          </DialogTitle>
          <DialogDescription>
            {presentation === 'page' ? (
              <Trans>
                Start with a page-based table, then add properties and records as you go.
              </Trans>
            ) : (
              <Trans>Prepare a file-native database, review its exact plan, then commit it.</Trans>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogBody
          className={cn(
            'space-y-5',
            presentation === 'page' &&
              'mx-0 px-6 py-6 sm:mx-auto sm:w-full sm:max-w-3xl sm:px-10 lg:max-w-5xl',
          )}
        >
          <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <legend className="sr-only">Database creation method</legend>
            {(
              [
                ['blank', Plus, 'Blank'],
                ['template', LayoutTemplate, 'Template'],
                ['folder', FolderOpen, 'Existing folder'],
                ['csv', FileSpreadsheet, 'CSV or TSV'],
              ] as const
            ).map(([value, Icon, label]) => (
              <Button
                key={value}
                type="button"
                variant={mode === value ? 'default' : 'outline'}
                className="h-auto flex-col py-3"
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  setError(null);
                }}
              >
                <Icon /> {label}
              </Button>
            ))}
          </fieldset>

          <label className="grid gap-1.5 text-sm" htmlFor="database-creation-name">
            <span className="font-medium">
              <Trans>Database name</Trans>
            </span>
            <Input
              id="database-creation-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Untitled database"
              autoFocus
            />
          </label>
          {mode === 'blank' ? (
            <span className="-mt-3 block text-muted-foreground text-xs">
              <Trans>Optional — you can rename it from the table header.</Trans>
            </span>
          ) : null}

          {mode === 'template' ? (
            <div className="grid gap-1.5 text-sm">
              <label className="font-medium" htmlFor="database-creation-template">
                <Trans>Starter template</Trans>
              </label>
              <Select
                value={template}
                onValueChange={(value) => setTemplate(value as DatabaseCreationTemplateKey)}
              >
                <SelectTrigger id="database-creation-template" aria-label="Starter template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATABASE_CREATION_TEMPLATES.map((candidate) => (
                    <SelectItem key={candidate.key} value={candidate.key}>
                      {candidate.name} · {candidate.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {mode === 'folder' ? (
            <div className="space-y-3">
              <label className="grid gap-1.5 text-sm" htmlFor="database-creation-folder">
                <span className="font-medium">
                  <Trans>Content-relative folder</Trans>
                </span>
                <Input
                  id="database-creation-folder"
                  value={folder}
                  onChange={(event) => setFolder(event.target.value)}
                  placeholder="research/notes"
                />
              </label>
              <label
                className="flex items-center gap-2 text-sm"
                htmlFor="database-creation-subfolders"
              >
                <Checkbox
                  id="database-creation-subfolders"
                  checked={includeSubfolders}
                  onCheckedChange={(checked) => setIncludeSubfolders(checked === true)}
                />
                <Trans>Include nested folders in the onboarding preview</Trans>
              </label>
              <p className="text-muted-foreground text-xs">
                <Trans>
                  Creating the manifest does not modify existing records. Identity assignment
                  remains a separate reviewed onboarding operation.
                </Trans>
              </p>
            </div>
          ) : null}

          {mode === 'csv' ? (
            <label className="grid gap-1.5 text-sm" htmlFor="database-creation-file">
              <span className="font-medium">
                <Trans>CSV or TSV file</Trans>
              </span>
              <Input
                id="database-creation-file"
                type="file"
                accept=".csv,.tsv,text/csv,text/tab-separated-values"
                aria-label="Create database from CSV or TSV file"
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (!selected) {
                    setFile(null);
                    return;
                  }
                  void selected.text().then(
                    (contents) => {
                      setFile({ name: selected.name, contents });
                      if (!name.trim()) setName(selected.name.replace(/\.(?:csv|tsv)$/i, ''));
                      setError(null);
                    },
                    () => setError('Unable to read the selected file'),
                  );
                }}
              />
              {file ? <span className="text-muted-foreground text-xs">{file.name}</span> : null}
            </label>
          ) : null}

          {summary ? (
            <section className="rounded-md border bg-muted/30 p-3" aria-label="Creation summary">
              <h3 className="font-medium text-sm">
                <Trans>What will be created</Trans>
              </h3>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[9rem_1fr]">
                <dt className="text-muted-foreground">
                  <Trans>Initial view</Trans>
                </dt>
                <dd>{summary.initialView}</dd>
                <dt className="text-muted-foreground">
                  <Trans>Initial properties</Trans>
                </dt>
                <dd>{summary.propertyNames.join(', ')}</dd>
                <dt className="text-muted-foreground">
                  <Trans>Initial records</Trans>
                </dt>
                <dd>{summary.initialRecordCount}</dd>
              </dl>
              <details className="mt-3 border-t pt-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  <Trans>Advanced storage details</Trans>
                </summary>
                <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[9rem_1fr]">
                  <dt className="text-muted-foreground">
                    <Trans>One record means</Trans>
                  </dt>
                  <dd>{summary.recordMeaning}</dd>
                  <dt className="text-muted-foreground">
                    <Trans>Canonical folder</Trans>
                  </dt>
                  <dd>
                    <code>{summary.canonicalFolder}</code>
                  </dd>
                  <dt className="text-muted-foreground">
                    <Trans>Stable key</Trans>
                  </dt>
                  <dd>
                    <code>{summary.stableKey}</code>
                  </dd>
                </dl>
              </details>
            </section>
          ) : null}

          {preparedState?.sampleRecords && preparedState.sampleRecords.length > 0 ? (
            <section
              className="rounded-md border border-primary/30 bg-primary/5 p-3"
              aria-label="Initial page preview"
              data-testid="database-creation-page-preview"
            >
              <h3 className="font-medium text-sm">
                <Trans>First page preview</Trans>
              </h3>
              <p className="mt-1 text-muted-foreground text-xs">
                <Trans>These example rows will open in the editable table after commit.</Trans>
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {preparedState.sampleRecords.slice(0, 4).map((record) => {
                  const source = preparedState?.sources.find(
                    (candidate) => candidate.key === record.sourceKey,
                  );
                  const properties = source?.properties.slice(0, 4) ?? [];
                  return (
                    <article
                      key={record.id ?? `${record.sourceKey}:${JSON.stringify(record.values)}`}
                      className="rounded border bg-background p-2 text-xs"
                    >
                      <div className="font-medium">Page preview</div>
                      <dl className="mt-1 grid gap-1">
                        {properties.map((property) => (
                          <div key={property.key} className="grid grid-cols-[auto_1fr] gap-2">
                            <dt className="text-muted-foreground">{property.name}</dt>
                            <dd className="truncate">
                              {previewValue(record.values[property.key])}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false, 'cancel')}>
              <Trans>Cancel</Trans>
            </Button>
            <Button type="button" onClick={submit}>
              {mode === 'blank' ? <Trans>Create database</Trans> : <Trans>Review creation</Trans>}
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

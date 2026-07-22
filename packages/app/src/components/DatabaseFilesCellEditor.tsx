import { Trans, useLingui } from '@lingui/react/macro';
import {
  type DatabaseFileAvailability,
  DatabaseFilesValueSchema,
  type DatabaseFileValue,
  databaseFileDisplayName,
  databaseFileIdentity,
  mediaKindForSidebarAssetExtension,
  toDesktopAssetHref,
} from '@nedian0brien/synapsenote-core';
import { AlertCircle, ArrowDown, ArrowUp, ExternalLink, Plus, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { uploadFile } from '@/editor/image-upload/upload-file';
import { dispatchExternalLinkClick } from '@/lib/external-link';

function parseDraft(draft: string): DatabaseFileValue[] {
  try {
    return DatabaseFilesValueSchema.parse(JSON.parse(draft));
  } catch {
    return [];
  }
}

function localAssetHref(path: string): string {
  return toDesktopAssetHref(`/api/asset?path=${encodeURIComponent(path)}`);
}

function FileAvailability({
  file,
  observed,
}: {
  file: DatabaseFileValue;
  observed?: DatabaseFileAvailability;
}) {
  const [available, setAvailable] = useState<boolean | null>(
    file.kind === 'external' ? true : observed === undefined ? null : observed === 'available',
  );
  useEffect(() => {
    if (file.kind === 'external') {
      setAvailable(true);
      return;
    }
    if (observed !== undefined) {
      setAvailable(observed === 'available');
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/asset-text?path=${encodeURIComponent(file.path)}`, {
      headers: { Range: 'bytes=0-0' },
      signal: controller.signal,
    })
      .then((response) => {
        setAvailable(response.status !== 404 && response.status !== 400);
        controller.abort();
      })
      .catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) setAvailable(false);
      });
    return () => controller.abort();
  }, [file, observed]);
  if (available !== false) return null;
  return (
    <span className="inline-flex items-center gap-1 text-destructive text-xs" role="status">
      <AlertCircle className="size-3" aria-hidden="true" />
      <Trans>Missing local file</Trans>
    </span>
  );
}

export function DatabaseFilesCellEditor({
  draft,
  propertyName,
  parentDocName,
  fileStates = {},
  onDraftChange,
}: {
  draft: string;
  propertyName: string;
  parentDocName: string;
  fileStates?: Readonly<Record<string, DatabaseFileAvailability>>;
  onDraftChange: (draft: string) => void;
}) {
  'use no memo';
  const { t } = useLingui();
  const files = parseDraft(draft);
  const [externalUrl, setExternalUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commit = (next: DatabaseFileValue[]) => onDraftChange(JSON.stringify(next));
  const update = (index: number, patch: Partial<DatabaseFileValue>) => {
    const current = files[index];
    if (!current) return;
    const next = [...files];
    next[index] = { ...current, ...patch } as DatabaseFileValue;
    commit(next);
  };
  const addExternal = () => {
    const parsed = DatabaseFilesValueSchema.safeParse([
      ...files,
      { kind: 'external', url: externalUrl },
    ]);
    if (!parsed.success) {
      setError(t`Enter a unique HTTP or HTTPS URL without embedded credentials.`);
      return;
    }
    commit(parsed.data);
    setExternalUrl('');
    setError(null);
  };
  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const result = await uploadFile(file, [], { docName: parentDocName });
      const path = result.url.replace(/^\//, '');
      const parsed = DatabaseFilesValueSchema.parse([
        ...files,
        { kind: 'local', path, name: file.name },
      ]);
      commit(parsed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t`Upload failed.`);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <fieldset className="flex min-w-[30rem] max-w-2xl flex-col gap-2">
      <legend className="sr-only">{`Edit ${propertyName}`}</legend>
      <div className="flex flex-col gap-2">
        {files.map((file, index) => {
          const identity = databaseFileIdentity(file);
          const href = file.kind === 'local' ? localAssetHref(file.path) : file.url;
          const extension = identity.split(/[?#]/, 1)[0]?.split('.').at(-1) ?? '';
          const mediaKind = mediaKindForSidebarAssetExtension(extension);
          return (
            <div key={identity} className="rounded-md border p-2" data-database-file={identity}>
              <div className="flex items-start gap-2">
                {mediaKind === 'image' ? (
                  <img
                    src={href}
                    alt=""
                    className="size-12 shrink-0 rounded border object-cover"
                    draggable={false}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1 truncate text-azure-blue text-xs underline"
                    onClick={(event) => {
                      if (file.kind === 'external') dispatchExternalLinkClick(event, file.url);
                    }}
                    onAuxClick={(event) => {
                      if (file.kind === 'external' && event.button === 1) {
                        dispatchExternalLinkClick(event, file.url);
                      }
                    }}
                  >
                    {databaseFileDisplayName(file)}
                    <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                  </a>
                  <div className="truncate text-muted-foreground text-xs" title={identity}>
                    {identity}
                  </div>
                  <FileAvailability
                    file={file}
                    observed={file.kind === 'local' ? fileStates[file.path] : undefined}
                  />
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={index === 0}
                  aria-label={`Move ${databaseFileDisplayName(file)} up`}
                  onClick={() => {
                    const next = [...files];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    commit(next);
                  }}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={index === files.length - 1}
                  aria-label={`Move ${databaseFileDisplayName(file)} down`}
                  onClick={() => {
                    const next = [...files];
                    [next[index], next[index + 1]] = [next[index + 1], next[index]];
                    commit(next);
                  }}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove ${databaseFileDisplayName(file)}`}
                  onClick={() => commit(files.filter((_, candidate) => candidate !== index))}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input
                  value={file.name ?? ''}
                  placeholder={t`Display name`}
                  aria-label={`Display name for ${identity}`}
                  onChange={(event) =>
                    update(index, { name: event.currentTarget.value || undefined })
                  }
                />
                <Input
                  value={file.caption ?? ''}
                  placeholder={t`Caption`}
                  aria-label={`Caption for ${identity}`}
                  onChange={(event) =>
                    update(index, { caption: event.currentTarget.value || undefined })
                  }
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          aria-label={`Upload file to ${propertyName}`}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload />
          {busy ? <Trans>Uploading</Trans> : <Trans>Upload</Trans>}
        </Button>
        <Input
          value={externalUrl}
          type="url"
          placeholder="https://"
          aria-label={`External URL for ${propertyName}`}
          onChange={(event) => setExternalUrl(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addExternal();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!externalUrl}
          onClick={addExternal}
        >
          <Plus />
          <Trans>Add URL</Trans>
        </Button>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </fieldset>
  );
}

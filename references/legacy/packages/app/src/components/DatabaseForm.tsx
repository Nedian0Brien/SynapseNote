import { Trans } from '@lingui/react/macro';
import type {
  DatabaseFormValue,
  DatabasePerson,
  DatabaseProperty,
  DatabaseSource,
  DatabaseView,
} from '@nedian0brien/synapsenote-core';
import { CheckCircle2, Loader2, Paperclip, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { uploadFile } from '@/editor/image-upload/upload-file';
import { formatDatabaseDateTime } from '@/lib/database-display-format';
import { type DatabaseFormSubmitResult, submitDatabaseForm } from '@/lib/database-form-client';

type FormView = DatabaseView & { layout: Extract<DatabaseView['layout'], { type: 'form' }> };
export type DatabaseFormSubmit = (input: {
  databaseId: string;
  sourceId: string;
  viewId: string;
  submissionId: string;
  startedAt: string;
  answers: Readonly<Record<string, DatabaseFormValue>>;
  honeypot?: string;
}) => Promise<DatabaseFormSubmitResult>;

function isEmpty(value: DatabaseFormValue | undefined): boolean {
  return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function visibleQuestions(view: FormView, answers: Readonly<Record<string, DatabaseFormValue>>) {
  const questions = view.layout.configuration.questions;
  const byId = new Map(questions.map((question) => [question.id, question] as const));
  return questions.filter((question) => {
    if (!question.visibleWhen) return true;
    const matches = question.visibleWhen.conditions.map((condition) => {
      const dependency = byId.get(condition.questionId);
      const answer = dependency ? answers[dependency.propertyId] : undefined;
      if (condition.operator === 'is_empty') return isEmpty(answer);
      if (condition.operator === 'is_not_empty') return !isEmpty(answer);
      const equal = JSON.stringify(answer) === JSON.stringify(condition.value);
      return condition.operator === 'equals' ? equal : !equal;
    });
    return question.visibleWhen.mode === 'all' ? matches.every(Boolean) : matches.some(Boolean);
  });
}

function FormControl({
  property,
  value,
  people,
  filesEnabled,
  maxFiles,
  uploadEndpoint,
  disabled,
  onChange,
}: {
  property: DatabaseProperty;
  value: DatabaseFormValue | undefined;
  people: readonly DatabasePerson[];
  filesEnabled: boolean;
  maxFiles: number;
  uploadEndpoint: string;
  disabled: boolean;
  onChange: (value: DatabaseFormValue | undefined) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  if (property.type === 'checkbox') {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Checkbox
          aria-label="Yes"
          checked={value === true}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
        <Trans>Yes</Trans>
      </div>
    );
  }
  if (property.type === 'select' || property.type === 'status') {
    return (
      <Select
        value={typeof value === 'string' ? value : '__empty'}
        disabled={disabled}
        onValueChange={(next) => onChange(next === '__empty' ? undefined : next)}
      >
        <SelectTrigger aria-label={property.name}>
          <SelectValue placeholder="Choose an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__empty">No answer</SelectItem>
          {property.options
            .filter((option) => option.archived !== true)
            .map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    );
  }
  if (property.type === 'multi_select') {
    const selected = Array.isArray(value) ? new Set(value as string[]) : new Set<string>();
    return (
      <div className="flex flex-wrap gap-3 rounded-md border p-3">
        {property.options
          .filter((option) => option.archived !== true)
          .map((option) => (
            <div key={option.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                aria-label={option.name}
                checked={selected.has(option.id)}
                disabled={disabled}
                onCheckedChange={(checked) => {
                  const next = new Set(selected);
                  if (checked === true) next.add(option.id);
                  else next.delete(option.id);
                  onChange([...next]);
                }}
              />
              {option.name}
            </div>
          ))}
      </div>
    );
  }
  if (property.type === 'person') {
    const selected = Array.isArray(value) ? new Set(value as string[]) : new Set<string>();
    return (
      <div className="flex flex-wrap gap-3 rounded-md border p-3">
        {people.map((person) => (
          <div key={person.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              aria-label={person.name}
              checked={selected.has(person.id)}
              disabled={disabled}
              onCheckedChange={(checked) => {
                const next = new Set(selected);
                if (!property.multiple) next.clear();
                if (checked === true) next.add(person.id);
                else next.delete(person.id);
                onChange([...next]);
              }}
            />
            {person.name}
          </div>
        ))}
      </div>
    );
  }
  if (property.type === 'files') {
    const files = Array.isArray(value)
      ? (value as Array<{ kind: 'local'; path: string; name?: string }>)
      : [];
    return (
      <div className="space-y-2">
        {files.map((file, index) => (
          <div key={file.path} className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
            <Paperclip className="size-4" />
            <span className="min-w-0 flex-1 truncate">{file.name ?? file.path}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${file.name ?? file.path}`}
              disabled={disabled}
              onClick={() => onChange(files.filter((_, candidate) => candidate !== index))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Input
          type="file"
          multiple
          disabled={disabled || uploading || !filesEnabled || files.length >= maxFiles}
          aria-label={`Upload files for ${property.name}`}
          onChange={async (event) => {
            const input = event.currentTarget;
            const selected = [...(input.files ?? [])].slice(
              0,
              Math.max(0, maxFiles - files.length),
            );
            if (selected.length === 0) return;
            setUploading(true);
            setUploadError(null);
            try {
              const uploaded = [];
              for (const file of selected) {
                const result = await uploadFile(file, [], {
                  docName: 'form-response',
                  endpoint: uploadEndpoint,
                });
                uploaded.push({
                  kind: 'local' as const,
                  path: result.url.replace(/^\//, ''),
                  name: file.name,
                });
              }
              onChange([...files, ...uploaded]);
            } catch (cause) {
              setUploadError(cause instanceof Error ? cause.message : 'Upload failed.');
            }
            setUploading(false);
            input.value = '';
          }}
        />
        {uploading ? <p className="text-muted-foreground text-xs">Uploading</p> : null}
        {uploadError ? <p className="text-destructive text-xs">{uploadError}</p> : null}
      </div>
    );
  }
  if (property.type === 'place') {
    const place =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as { label?: string; address?: string; lat?: number; lon?: number })
        : {};
    const emit = (patch: Partial<typeof place>) =>
      onChange({
        label: patch.label ?? place.label ?? '',
        address: patch.address ?? place.address ?? '',
        lat: patch.lat ?? place.lat ?? 0,
        lon: patch.lon ?? place.lon ?? 0,
        precision: 'exact',
        source: 'manual',
      });
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={place.label ?? ''}
          placeholder="Place name"
          disabled={disabled}
          onChange={(event) => emit({ label: event.currentTarget.value })}
        />
        <Input
          value={place.address ?? ''}
          placeholder="Address"
          disabled={disabled}
          onChange={(event) => emit({ address: event.currentTarget.value })}
        />
        <Input
          type="number"
          value={place.lat ?? 0}
          min={-90}
          max={90}
          disabled={disabled}
          aria-label={`${property.name} latitude`}
          onChange={(event) => emit({ lat: Number(event.currentTarget.value) })}
        />
        <Input
          type="number"
          value={place.lon ?? 0}
          min={-180}
          max={180}
          disabled={disabled}
          aria-label={`${property.name} longitude`}
          onChange={(event) => emit({ lon: Number(event.currentTarget.value) })}
        />
      </div>
    );
  }
  if (property.type === 'relation') {
    const current = property.cardinality === 'one' && typeof value === 'string' ? value : '';
    return (
      <Input
        value={current}
        aria-label={property.name}
        disabled={disabled}
        placeholder="Stable record ID (rec_)"
        onChange={(event) => {
          const next = event.currentTarget.value.trim();
          onChange(
            property.cardinality === 'one' ? next || undefined : next ? next.split(/\s*,\s*/) : [],
          );
        }}
      />
    );
  }
  if (property.type === 'date') {
    return (
      <Input
        type="date"
        aria-label={property.name}
        value={typeof value === 'string' ? value : ''}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value || undefined)}
      />
    );
  }
  if (property.type === 'number') {
    return (
      <Input
        type="number"
        aria-label={property.name}
        value={typeof value === 'number' ? value : ''}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.currentTarget.value === '' ? undefined : Number(event.currentTarget.value))
        }
      />
    );
  }
  if (property.type === 'text') {
    return (
      <Textarea
        aria-label={property.name}
        value={typeof value === 'string' ? value : ''}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }
  return (
    <Input
      aria-label={property.name}
      type={
        property.type === 'email'
          ? 'email'
          : property.type === 'url'
            ? 'url'
            : property.type === 'phone'
              ? 'tel'
              : 'text'
      }
      value={typeof value === 'string' ? value : ''}
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function DatabaseFormContent({
  databaseId,
  source,
  view,
  people,
  submit = submitDatabaseForm,
}: {
  databaseId: string;
  source: DatabaseSource;
  view: FormView;
  people: readonly DatabasePerson[];
  submit?: DatabaseFormSubmit;
}) {
  'use no memo';
  const configuration = view.layout.configuration;
  const [answers, setAnswers] = useState<Record<string, DatabaseFormValue>>({});
  const [honeypot, setHoneypot] = useState('');
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [submissionId, setSubmissionId] = useState(() => `sub_${crypto.randomUUID()}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DatabaseFormSubmitResult | null>(null);
  const visible = visibleQuestions(view, answers);
  const closed = configuration.closesAt ? Date.now() >= Date.parse(configuration.closesAt) : false;

  if (closed) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-dashed p-8 text-center">
        <h3 className="font-semibold text-lg">
          <Trans>Form closed</Trans>
        </h3>
        <p className="mt-2 text-muted-foreground text-sm">{configuration.closedMessage}</p>
      </div>
    );
  }
  if (result) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border p-8 text-center" role="status">
        <CheckCircle2 className="mx-auto size-10 text-green-600" />
        <h3 className="mt-3 font-semibold text-lg">{result.confirmation.title}</h3>
        <p className="mt-2 text-muted-foreground text-sm">{result.confirmation.message}</p>
        {result.confirmation.allowAnotherResponse ? (
          <Button
            type="button"
            variant="outline"
            className="mt-5"
            onClick={() => {
              setAnswers({});
              setResult(null);
              setError(null);
              setStartedAt(new Date().toISOString());
              setSubmissionId(`sub_${crypto.randomUUID()}`);
            }}
          >
            <Trans>Submit another response</Trans>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="mx-auto max-w-2xl space-y-6 p-2 sm:p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const missing = visible.find(
          (question) => question.required && isEmpty(answers[question.propertyId]),
        );
        if (missing) {
          setError(`${missing.label} is required.`);
          return;
        }
        setBusy(true);
        setError(null);
        try {
          const submitted = await submit({
            databaseId,
            sourceId: source.id,
            viewId: view.id,
            submissionId,
            startedAt,
            answers: Object.fromEntries(
              Object.entries(answers).filter(([propertyId]) =>
                visible.some((question) => question.propertyId === propertyId),
              ),
            ),
            honeypot,
          });
          setResult(submitted);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Unable to submit this response.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <h2 className="font-semibold text-2xl">{configuration.title}</h2>
        {configuration.description ? (
          <p className="mt-2 whitespace-pre-wrap text-muted-foreground text-sm">
            {configuration.description}
          </p>
        ) : null}
        {configuration.closesAt ? (
          <p className="mt-2 text-muted-foreground text-xs">
            Accepting responses until {formatDatabaseDateTime(configuration.closesAt)}
          </p>
        ) : null}
      </div>
      <div className="sr-only" aria-hidden="true">
        <span>Website</span>
        <Input
          aria-label="Website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(event) => setHoneypot(event.currentTarget.value)}
        />
      </div>
      {visible.map((question) => {
        const property = source.properties.find(
          (candidate) => candidate.id === question.propertyId,
        );
        if (!property) return null;
        return (
          <fieldset key={question.id} className="space-y-2 rounded-lg border p-4">
            <legend className="px-1 font-medium text-sm">
              {question.label}{' '}
              {question.required ? (
                <span className="text-destructive">
                  *<span className="sr-only"> required</span>
                </span>
              ) : null}
            </legend>
            {question.description ? (
              <p className="text-muted-foreground text-xs">{question.description}</p>
            ) : null}
            <FormControl
              property={property}
              value={answers[property.id]}
              people={people}
              filesEnabled={configuration.fileUploads.enabled}
              maxFiles={configuration.fileUploads.maxFilesPerQuestion}
              uploadEndpoint={`/api/databases/forms/upload?${new URLSearchParams({
                databaseId,
                sourceId: source.id,
                viewId: view.id,
              })}`}
              disabled={busy}
              onChange={(value) =>
                setAnswers((current) => {
                  if (value === undefined) {
                    const { [property.id]: _removed, ...rest } = current;
                    return rest;
                  }
                  return { ...current, [property.id]: value };
                })
              }
            />
          </fieldset>
        );
      })}
      {error ? (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : null}
        <Trans>Submit response</Trans>
      </Button>
      <p className="text-muted-foreground text-xs">
        Responses are written directly to {source.name}.
      </p>
    </form>
  );
}

export function DatabaseForm({
  databaseId,
  source,
  view,
  people,
  submit,
}: {
  databaseId: string;
  source: DatabaseSource;
  view: DatabaseView;
  people: readonly DatabasePerson[];
  submit?: DatabaseFormSubmit;
}) {
  if (view.layout.type !== 'form') return null;
  return (
    <DatabaseFormContent
      databaseId={databaseId}
      source={source}
      view={view as FormView}
      people={people}
      submit={submit}
    />
  );
}

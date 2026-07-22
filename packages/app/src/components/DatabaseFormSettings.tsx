import type { DatabaseFormViewConfiguration, DatabaseSource } from '@nedian0brien/synapsenote-core';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
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

const READ_ONLY_TYPES = new Set([
  'formula',
  'rollup',
  'created_time',
  'last_edited_time',
  'created_by',
  'last_edited_by',
  'button',
  'unique_id',
]);

function localDateTime(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function DatabaseFormSettings({
  source,
  value,
  onChange,
}: {
  source: DatabaseSource;
  value: DatabaseFormViewConfiguration;
  onChange: (value: DatabaseFormViewConfiguration) => void;
}) {
  const update = (patch: Partial<DatabaseFormViewConfiguration>) =>
    onChange({ ...value, ...patch });
  const writable = source.properties.filter((property) => !READ_ONLY_TYPES.has(property.type));
  const mapped = new Set(value.questions.map((question) => question.propertyId));
  const available = writable.filter((property) => !mapped.has(property.id));
  const scalar = writable.filter((property) =>
    ['title', 'text', 'url', 'email', 'phone', 'number'].includes(property.type),
  );

  return (
    <section className="space-y-4" aria-label="Saved Form settings">
      <strong>Form access and response policy</strong>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 text-xs">
          <span>Access</span>
          <Select
            value={value.access}
            onValueChange={(access) => update({ access: access as 'internal' | 'public' })}
          >
            <SelectTrigger aria-label="Form access">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="internal">Internal workspace only</SelectItem>
              <SelectItem value="public">Public link</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 text-xs">
          <span>Close date (optional)</span>
          <Input
            type="datetime-local"
            value={localDateTime(value.closesAt)}
            aria-label="Form close date"
            onChange={(event) =>
              update(
                event.currentTarget.value
                  ? { closesAt: new Date(event.currentTarget.value).toISOString() }
                  : { closesAt: undefined },
              )
            }
          />
        </div>
        <div className="space-y-1 text-xs sm:col-span-2">
          <span>Form title</span>
          <Input
            aria-label="Form title"
            value={value.title}
            maxLength={200}
            onChange={(event) => update({ title: event.currentTarget.value })}
          />
        </div>
        <div className="space-y-1 text-xs sm:col-span-2">
          <span>Description</span>
          <Textarea
            aria-label="Form description"
            value={value.description ?? ''}
            maxLength={2_000}
            onChange={(event) => update({ description: event.currentTarget.value || undefined })}
          />
        </div>
        <div className="space-y-1 text-xs sm:col-span-2">
          <span>Closed message</span>
          <Input
            aria-label="Form closed message"
            value={value.closedMessage}
            maxLength={2_000}
            onChange={(event) => update({ closedMessage: event.currentTarget.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <strong className="text-sm">Questions and response mapping</strong>
          <Select
            value="add"
            disabled={available.length === 0}
            onValueChange={(propertyId) => {
              if (propertyId === 'add') return;
              const property = source.properties.find((candidate) => candidate.id === propertyId);
              if (!property) return;
              update({
                questions: [
                  ...value.questions,
                  {
                    id: `frmq_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`,
                    propertyId: property.id,
                    label: property.name,
                    required: property.type === 'title' || property.required,
                  },
                ],
                fileUploads:
                  property.type === 'files'
                    ? { ...value.fileUploads, enabled: true }
                    : value.fileUploads,
              });
            }}
          >
            <SelectTrigger className="w-52" aria-label="Add Form question">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="add">Add property question</SelectItem>
              {available.map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {value.questions.map((question, index) => {
          const property = source.properties.find(
            (candidate) => candidate.id === question.propertyId,
          );
          const firstCondition = question.visibleWhen?.conditions[0];
          return (
            <div key={question.id} className="space-y-3 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
                  {property?.name ?? question.propertyId}
                </span>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={index === 0}
                  aria-label={`Move ${question.label} up`}
                  onClick={() => {
                    const questions = [...value.questions];
                    const current = questions[index];
                    const previous = questions[index - 1];
                    if (!current || !previous) return;
                    [questions[index - 1], questions[index]] = [current, previous];
                    update({ questions });
                  }}
                >
                  <ChevronUp />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={index === value.questions.length - 1}
                  aria-label={`Move ${question.label} down`}
                  onClick={() => {
                    const questions = [...value.questions];
                    const current = questions[index];
                    const next = questions[index + 1];
                    if (!current || !next) return;
                    [questions[index], questions[index + 1]] = [next, current];
                    update({ questions });
                  }}
                >
                  <ChevronDown />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={property?.type === 'title' || property?.required === true}
                  aria-label={`Remove ${question.label}`}
                  onClick={() =>
                    update({
                      questions: value.questions.filter(
                        (candidate) => candidate.id !== question.id,
                      ),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  value={question.label}
                  maxLength={200}
                  aria-label={`Label for ${property?.name ?? question.propertyId}`}
                  onChange={(event) =>
                    update({
                      questions: value.questions.map((candidate) =>
                        candidate.id === question.id
                          ? { ...candidate, label: event.currentTarget.value }
                          : candidate,
                      ),
                    })
                  }
                />
                <div className="flex items-center gap-2 text-xs">
                  <Checkbox
                    aria-label={`Required ${question.label}`}
                    checked={question.required}
                    disabled={property?.type === 'title' || property?.required === true}
                    onCheckedChange={(checked) =>
                      update({
                        questions: value.questions.map((candidate) =>
                          candidate.id === question.id
                            ? { ...candidate, required: checked === true }
                            : candidate,
                        ),
                      })
                    }
                  />
                  Required
                </div>
              </div>
              <Input
                value={question.description ?? ''}
                maxLength={1_000}
                placeholder="Question help text (optional)"
                onChange={(event) =>
                  update({
                    questions: value.questions.map((candidate) =>
                      candidate.id === question.id
                        ? { ...candidate, description: event.currentTarget.value || undefined }
                        : candidate,
                    ),
                  })
                }
              />
              {index > 0 ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <Select
                    value={firstCondition?.questionId ?? 'always'}
                    onValueChange={(questionId) =>
                      update({
                        questions: value.questions.map((candidate) =>
                          candidate.id === question.id
                            ? questionId === 'always'
                              ? { ...candidate, visibleWhen: undefined }
                              : {
                                  ...candidate,
                                  visibleWhen: {
                                    mode: 'all',
                                    conditions: [{ questionId, operator: 'equals', value: '' }],
                                  },
                                }
                            : candidate,
                        ),
                      })
                    }
                  >
                    <SelectTrigger aria-label={`Visibility for ${question.label}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="always">Always visible</SelectItem>
                      {value.questions.slice(0, index).map((dependency) => (
                        <SelectItem key={dependency.id} value={dependency.id}>
                          When {dependency.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {firstCondition ? (
                    <Select
                      value={firstCondition.operator}
                      onValueChange={(operator) =>
                        update({
                          questions: value.questions.map((candidate) =>
                            candidate.id === question.id
                              ? {
                                  ...candidate,
                                  visibleWhen: {
                                    mode: 'all',
                                    conditions: [
                                      {
                                        questionId: firstCondition.questionId,
                                        operator: operator as typeof firstCondition.operator,
                                        ...(['equals', 'not_equals'].includes(operator)
                                          ? { value: firstCondition.value ?? '' }
                                          : {}),
                                      },
                                    ],
                                  },
                                }
                              : candidate,
                          ),
                        })
                      }
                    >
                      <SelectTrigger aria-label={`Condition operator for ${question.label}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equals">Equals</SelectItem>
                        <SelectItem value="not_equals">Does not equal</SelectItem>
                        <SelectItem value="is_empty">Is empty</SelectItem>
                        <SelectItem value="is_not_empty">Is not empty</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                  {firstCondition &&
                  (firstCondition.operator === 'equals' ||
                    firstCondition.operator === 'not_equals') ? (
                    <Input
                      value={
                        typeof firstCondition.value === 'string'
                          ? firstCondition.value
                          : JSON.stringify(firstCondition.value ?? '')
                      }
                      placeholder="Expected value"
                      onChange={(event) =>
                        update({
                          questions: value.questions.map((candidate) =>
                            candidate.id === question.id
                              ? {
                                  ...candidate,
                                  visibleWhen: {
                                    mode: 'all',
                                    conditions: [
                                      { ...firstCondition, value: event.currentTarget.value },
                                    ],
                                  },
                                }
                              : candidate,
                          ),
                        })
                      }
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 text-xs">
          <span>Confirmation title</span>
          <Input
            aria-label="Form confirmation title"
            value={value.confirmation.title}
            onChange={(event) =>
              update({ confirmation: { ...value.confirmation, title: event.currentTarget.value } })
            }
          />
        </div>
        <div className="space-y-1 text-xs">
          <span>Confirmation message</span>
          <Input
            aria-label="Form confirmation message"
            value={value.confirmation.message}
            onChange={(event) =>
              update({
                confirmation: { ...value.confirmation, message: event.currentTarget.value },
              })
            }
          />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Checkbox
            aria-label="Allow another Form response"
            checked={value.confirmation.allowAnotherResponse}
            onCheckedChange={(checked) =>
              update({
                confirmation: { ...value.confirmation, allowAnotherResponse: checked === true },
              })
            }
          />
          Allow another response
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Checkbox
            aria-label="Enable Form file uploads"
            checked={value.fileUploads.enabled}
            onCheckedChange={(checked) =>
              update({ fileUploads: { ...value.fileUploads, enabled: checked === true } })
            }
          />
          Enable local file uploads
        </div>
        <div className="space-y-1 text-xs">
          <span>Files per question</span>
          <Input
            aria-label="Files per Form question"
            type="number"
            min={1}
            max={20}
            value={value.fileUploads.maxFilesPerQuestion}
            onChange={(event) =>
              update({
                fileUploads: {
                  ...value.fileUploads,
                  maxFilesPerQuestion: Number(event.currentTarget.value),
                },
              })
            }
          />
        </div>
        <div className="space-y-1 text-xs">
          <span>Duplicate responses</span>
          <Select
            value={
              value.duplicateSubmission.type === 'allow'
                ? 'allow'
                : value.duplicateSubmission.propertyId
            }
            onValueChange={(propertyId) =>
              update({
                duplicateSubmission:
                  propertyId === 'allow'
                    ? { type: 'allow' }
                    : { type: 'reject_property', propertyId },
              })
            }
          >
            <SelectTrigger aria-label="Form duplicate policy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="allow">Allow duplicates</SelectItem>
              {scalar.map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  Reject duplicate {property.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 text-xs">
          <span>Responses per window</span>
          <Input
            aria-label="Responses per window"
            type="number"
            min={1}
            max={1_000}
            value={value.spamProtection.rateLimit.maxSubmissions}
            onChange={(event) =>
              update({
                spamProtection: {
                  ...value.spamProtection,
                  rateLimit: {
                    ...value.spamProtection.rateLimit,
                    maxSubmissions: Number(event.currentTarget.value),
                  },
                },
              })
            }
          />
        </div>
        <div className="space-y-1 text-xs">
          <span>Rate window seconds</span>
          <Input
            aria-label="Form rate window seconds"
            type="number"
            min={10}
            max={86_400}
            value={value.spamProtection.rateLimit.windowSeconds}
            onChange={(event) =>
              update({
                spamProtection: {
                  ...value.spamProtection,
                  rateLimit: {
                    ...value.spamProtection.rateLimit,
                    windowSeconds: Number(event.currentTarget.value),
                  },
                },
              })
            }
          />
        </div>
        <div className="space-y-1 text-xs">
          <span>Minimum completion seconds</span>
          <Input
            aria-label="Form minimum completion seconds"
            type="number"
            min={0}
            max={300}
            value={value.spamProtection.minimumCompletionSeconds}
            onChange={(event) =>
              update({
                spamProtection: {
                  ...value.spamProtection,
                  minimumCompletionSeconds: Number(event.currentTarget.value),
                },
              })
            }
          />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Checkbox
            aria-label="Form honeypot protection"
            checked={value.spamProtection.honeypot}
            onCheckedChange={(checked) =>
              update({ spamProtection: { ...value.spamProtection, honeypot: checked === true } })
            }
          />
          Honeypot protection
        </div>
        <div className="space-y-1 text-xs">
          <span>Retention</span>
          <Select
            value={value.retention.type}
            onValueChange={(type) =>
              update({
                retention:
                  type === 'workspace'
                    ? { type: 'workspace' }
                    : {
                        type: 'delete_after',
                        days: value.retention.type === 'delete_after' ? value.retention.days : 30,
                      },
              })
            }
          >
            <SelectTrigger aria-label="Form retention">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="workspace">Keep with workspace</SelectItem>
              <SelectItem value="delete_after">Delete after a period</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {value.retention.type === 'delete_after' ? (
          <div className="space-y-1 text-xs">
            <span>Retention days</span>
            <Input
              aria-label="Form retention days"
              type="number"
              min={1}
              max={3_650}
              value={value.retention.days}
              onChange={(event) =>
                update({
                  retention: { type: 'delete_after', days: Number(event.currentTarget.value) },
                })
              }
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

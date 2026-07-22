import { Trans } from '@lingui/react/macro';
import type { DatabaseProperty, DatabasePropertyType } from '@nedian0brien/synapsenote-core';
import {
  DatabasePropertySchema,
  databasePropertyConversionRule,
} from '@nedian0brien/synapsenote-core';
import type {
  DatabasePlanArtifact,
  DatabasePropertyConversionPlanPreview,
} from '@nedian0brien/synapsenote-server';
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { previewDatabasePropertyConversionPlan } from '@/lib/database-property-conversion-client';
import { classifyDatabaseUiProblem, type DatabaseUiProblem } from '@/lib/database-ui-problem';

const SIMPLE_TARGET_TYPES = [
  'text',
  'number',
  'checkbox',
  'date',
  'select',
  'multi_select',
  'url',
  'email',
  'phone',
  'place',
  'files',
] as const satisfies readonly DatabasePropertyType[];

function targetTypes(property: DatabaseProperty): DatabasePropertyType[] {
  if (property.type === 'title') return [];
  return SIMPLE_TARGET_TYPES.filter((targetType) => {
    if (targetType === property.type) return false;
    if (databasePropertyConversionRule(property.type, targetType).kind === 'blocked') return false;
    if (targetType === 'select' || targetType === 'multi_select') {
      return ['select', 'status', 'multi_select'].includes(property.type);
    }
    return true;
  });
}

function targetSemantics(
  property: DatabaseProperty,
  targetType: DatabasePropertyType,
): DatabaseProperty['semantics'] {
  const constraints = property.semantics.constraints;
  const targetConstraints = {
    unique: constraints.unique,
    ...(targetType === 'number' || targetType === 'date'
      ? {
          ...(constraints.min !== undefined ? { min: constraints.min } : {}),
          ...(constraints.max !== undefined ? { max: constraints.max } : {}),
        }
      : {}),
    ...(['text', 'url', 'email', 'phone'].includes(targetType)
      ? {
          ...(constraints.maxLength !== undefined ? { maxLength: constraints.maxLength } : {}),
          ...(constraints.pattern !== undefined ? { pattern: constraints.pattern } : {}),
        }
      : {}),
  };
  return {
    constraints: targetConstraints,
    inferencePolicy: property.semantics.inferencePolicy,
    sensitivity: property.semantics.sensitivity,
    ...(property.semantics.format && ['text', 'number', 'date'].includes(targetType)
      ? { format: property.semantics.format }
      : {}),
  };
}

/** Builds the subset of target schemas the human UI can configure without inventing vocabulary. */
export function createDatabasePropertyConversionTarget(
  property: DatabaseProperty,
  targetType: DatabasePropertyType,
): DatabaseProperty {
  const normalizedProperty = DatabasePropertySchema.parse(property);
  const common = {
    id: normalizedProperty.id,
    key: normalizedProperty.key,
    name: normalizedProperty.name,
    ...(normalizedProperty.description ? { description: normalizedProperty.description } : {}),
    aliases: normalizedProperty.aliases,
    required: normalizedProperty.required,
    semantics: targetSemantics(normalizedProperty, targetType),
  };
  if (targetType === 'select' || targetType === 'multi_select') {
    if (!['select', 'status', 'multi_select'].includes(normalizedProperty.type)) {
      throw new Error(`${targetType} conversion requires an existing option vocabulary`);
    }
    const options = (
      normalizedProperty as Extract<
        DatabaseProperty,
        { type: 'select' | 'status' | 'multi_select' }
      >
    ).options.map(({ id, key, name, color, archived }) => ({
      id,
      key,
      name,
      ...(color ? { color } : {}),
      ...(archived !== undefined ? { archived } : {}),
    }));
    return DatabasePropertySchema.parse({ ...common, type: targetType, options });
  }
  if (targetType === 'place') {
    return DatabasePropertySchema.parse({
      ...common,
      type: 'place',
      externalSearch: 'disabled',
      externalMap: 'disabled',
    });
  }
  return DatabasePropertySchema.parse({ ...common, type: targetType });
}

function compactValue(value: unknown): string {
  if (value === undefined) return '∅';
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  if (serialized === undefined) return String(value);
  return serialized.length > 100 ? `${serialized.slice(0, 97)}…` : serialized;
}

export function DatabasePropertyConversionDialog({
  open,
  onOpenChange,
  databaseId,
  sourceId,
  property,
  onReviewPlan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  databaseId: string;
  sourceId: string;
  property: DatabaseProperty;
  onReviewPlan: (plan: DatabasePlanArtifact) => void;
}) {
  'use no memo';
  const availableTargets = targetTypes(property);
  const [targetType, setTargetType] = useState<DatabasePropertyType | ''>(
    availableTargets[0] ?? '',
  );
  const [result, setResult] = useState<DatabasePropertyConversionPlanPreview | null>(null);
  const [lossApproved, setLossApproved] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading'>('idle');
  const [error, setError] = useState<DatabaseUiProblem | null>(null);

  const preview = () => {
    if (!targetType || status !== 'idle') return;
    setStatus('loading');
    setError(null);
    let targetProperty: DatabaseProperty;
    try {
      targetProperty = createDatabasePropertyConversionTarget(property, targetType);
    } catch (cause) {
      setError(classifyDatabaseUiProblem(cause, 'Unable to build the target property schema'));
      setStatus('idle');
      return;
    }
    void previewDatabasePropertyConversionPlan({
      databaseId,
      sourceId,
      propertyId: property.id,
      targetProperty,
      allowLossy: lossApproved,
    })
      .then(setResult)
      .catch((cause: unknown) => {
        setResult(null);
        setError(classifyDatabaseUiProblem(cause, 'Unable to preview property conversion'));
      })
      .finally(() => setStatus('idle'));
  };

  const changesToShow = result?.preview.changes.filter(
    (change) => change.outcome === 'blocked' || change.outcome === 'lossy',
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Convert property type</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Preview every indexed record before compiling one revision-bound migration plan.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="database-property-conversion-target">
              <Trans>Target type</Trans>
            </Label>
            <div className="flex items-center gap-3">
              <Badge variant="outline">{property.type}</Badge>
              <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
              <Select
                value={targetType}
                onValueChange={(value) => {
                  setTargetType(value as DatabasePropertyType);
                  setResult(null);
                  setLossApproved(false);
                  setError(null);
                }}
              >
                <SelectTrigger id="database-property-conversion-target" aria-label="Target type">
                  <SelectValue placeholder="Choose a target type" />
                </SelectTrigger>
                <SelectContent>
                  {availableTargets.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {availableTargets.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
              <Trans>
                This property cannot be converted independently. Derived properties and the only
                Title property require a broader schema migration.
              </Trans>
            </p>
          ) : null}

          {result ? (
            <section className="space-y-3 rounded-md border p-3" aria-label="Conversion preview">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={result.preview.committable ? 'primary' : 'outline'}>
                  {result.preview.rule.kind}
                </Badge>
                <span className="text-muted-foreground text-sm">{result.preview.rule.reason}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                {Object.entries(result.preview.summary).map(([label, count]) => (
                  <div key={label} className="rounded bg-muted px-2 py-1">
                    <span className="block text-muted-foreground text-xs">{label}</span>
                    <span className="font-mono">{count}</span>
                  </div>
                ))}
              </div>
              {changesToShow && changesToShow.length > 0 ? (
                <div
                  className="max-h-56 space-y-2 overflow-auto"
                  data-testid="conversion-risk-rows"
                >
                  {changesToShow.slice(0, 100).map((change) => (
                    <div key={change.recordId} className="rounded border px-2 py-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono">{change.recordId}</span>
                        <Badge variant="outline">{change.outcome}</Badge>
                      </div>
                      <p className="mt-1 break-all text-muted-foreground">
                        {compactValue(change.before)} → {compactValue(change.after)}
                      </p>
                      {change.reason ? (
                        <p className="mt-1 text-destructive">{change.reason}</p>
                      ) : null}
                    </div>
                  ))}
                  {changesToShow.length > 100 ? (
                    <p className="text-muted-foreground text-xs">
                      <Trans>
                        {changesToShow.length - 100} more risk rows are included in the exact plan.
                      </Trans>
                    </p>
                  ) : null}
                </div>
              ) : null}
              {result.preview.requiresLossyApproval ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                  <AlertTriangle className="mt-0.5 size-4 text-amber-600" aria-hidden="true" />
                  <div className="space-y-2">
                    <p className="text-sm">
                      <Trans>
                        Structured information will be flattened. Undo retains exact source values,
                        but a separate approval is required before a plan can be compiled.
                      </Trans>
                    </p>
                    <div className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={lossApproved}
                        aria-label="Approve lossy conversion"
                        onCheckedChange={(checked) => {
                          setLossApproved(checked === true);
                          setResult(null);
                        }}
                      />
                      <span>
                        <Trans>I approve the listed lossy conversion.</Trans>
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {error ? (
            <p
              className="rounded-md border border-destructive/40 p-3 text-destructive text-sm"
              role="alert"
            >
              {error.message}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <Trans>Cancel</Trans>
            </Button>
            {result?.plan && result.preview.committable ? (
              <Button
                onClick={() => {
                  onReviewPlan(result.plan as DatabasePlanArtifact);
                  onOpenChange(false);
                }}
              >
                <Trans>Review exact plan</Trans>
              </Button>
            ) : (
              <Button disabled={!targetType || status === 'loading'} onClick={preview}>
                {status === 'loading' ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : null}
                {lossApproved ? (
                  <Trans>Approve and preview</Trans>
                ) : (
                  <Trans>Preview conversion</Trans>
                )}
              </Button>
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

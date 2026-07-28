import { Trans } from '@lingui/react/macro';
import type {
  DatabaseButtonAction,
  DatabaseDefinition,
  DatabaseProperty,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { AlertCircle, MousePointerClick, Plus } from 'lucide-react';
import { useState } from 'react';
import {
  DatabaseButtonActionEditor,
  freshButtonAction,
} from '@/components/DatabaseButtonActionEditor';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { nextDatabaseButtonActionId } from '@/lib/database-mutations/database-property-commands';

type ButtonProperty = Extract<DatabaseProperty, { type: 'button' }>;

/**
 * Validates the edited Button by rebuilding the whole definition and parsing
 * it, rather than re-implementing the rules here.
 *
 * A Button's legality is not local: an operation may only target a writable
 * property of THIS source, a create step must satisfy the required properties
 * of the source it targets, and webhook steps must follow every database step.
 * All three live in the manifest schema, so parsing the candidate is both the
 * complete check and exactly what the server will run on commit.
 */
function buttonIssues(
  database: DatabaseDefinition,
  source: DatabaseSource,
  property: ButtonProperty,
): readonly string[] {
  const sourceIndex = database.sources.findIndex((candidate) => candidate.id === source.id);
  const propertyIndex = source.properties.findIndex((candidate) => candidate.id === property.id);
  const result = DatabaseDefinitionSchema.safeParse({
    ...database,
    sources: database.sources.map((candidate) =>
      candidate.id === source.id
        ? {
            ...candidate,
            properties: candidate.properties.map((existing) =>
              existing.id === property.id ? property : existing,
            ),
          }
        : candidate,
    ),
  });
  if (result.success) return [];
  const mine = result.error.issues.filter(
    (issue) =>
      issue.path[0] === 'sources' &&
      issue.path[1] === sourceIndex &&
      issue.path[2] === 'properties' &&
      issue.path[3] === propertyIndex,
  );
  // Anything outside this property means the definition was already invalid
  // before the dialog opened; surfacing it is more useful than reporting
  // nothing and disabling Save with no reason shown.
  return (mine.length > 0 ? mine : result.error.issues).map((issue) => issue.message);
}

export function DatabaseButtonPropertyDialog({
  open,
  onOpenChange,
  database,
  source,
  property,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  database: DatabaseDefinition;
  source: DatabaseSource;
  property: ButtonProperty;
  onSave: (property: ButtonProperty) => void;
}) {
  const [label, setLabel] = useState(property.label);
  const [confirmationTitle, setConfirmationTitle] = useState(property.confirmation?.title ?? '');
  const [confirmationDescription, setConfirmationDescription] = useState(
    property.confirmation?.description ?? '',
  );
  const [confirmationEnabled, setConfirmationEnabled] = useState(
    property.confirmation !== undefined,
  );
  const [actions, setActions] = useState<readonly DatabaseButtonAction[]>(property.actions);

  const trimmedConfirmationTitle = confirmationTitle.trim();
  const candidate: ButtonProperty = {
    ...property,
    label: label.trim(),
    ...(confirmationEnabled && trimmedConfirmationTitle
      ? {
          confirmation: {
            title: trimmedConfirmationTitle,
            ...(confirmationDescription.trim()
              ? { description: confirmationDescription.trim() }
              : {}),
          },
        }
      : {}),
    actions: actions as ButtonProperty['actions'],
  };
  const issues = buttonIssues(database, source, candidate);
  const labelMissing = label.trim() === '';
  const confirmationIncomplete = confirmationEnabled && confirmationTitle.trim() === '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MousePointerClick className="size-4" /> {property.name}
          </DialogTitle>
          <DialogDescription>
            <Trans>
              A Button runs its steps in order against the record it sits on. Every step is checked
              against this database before it can be saved.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <div className="grid gap-2 sm:max-w-sm">
            <Label htmlFor="database-button-label">
              <Trans>Button label</Trans>
            </Label>
            <Input
              id="database-button-label"
              value={label}
              maxLength={200}
              aria-invalid={labelMissing}
              onChange={(event) => setLabel(event.currentTarget.value)}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="database-button-confirmation"
                checked={confirmationEnabled}
                onCheckedChange={(checked) => setConfirmationEnabled(checked === true)}
              />
              <Label htmlFor="database-button-confirmation">
                <Trans>Ask before running</Trans>
              </Label>
            </div>
            {confirmationEnabled ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={confirmationTitle}
                  maxLength={200}
                  aria-label="Confirmation title"
                  placeholder="Run this button?"
                  aria-invalid={confirmationIncomplete}
                  onChange={(event) => setConfirmationTitle(event.currentTarget.value)}
                />
                <Input
                  value={confirmationDescription}
                  maxLength={2000}
                  aria-label="Confirmation description"
                  placeholder="Optional detail"
                  onChange={(event) => setConfirmationDescription(event.currentTarget.value)}
                />
              </div>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label>
              <Trans>Steps</Trans>
            </Label>
            {actions.map((action, index) => (
              <DatabaseButtonActionEditor
                key={action.id}
                database={database}
                source={source}
                action={action}
                index={index}
                count={actions.length}
                onChange={(next) =>
                  setActions((current) =>
                    current.map((candidateAction, candidateIndex) =>
                      candidateIndex === index ? next : candidateAction,
                    ),
                  )
                }
                onRemove={() =>
                  setActions((current) =>
                    current.filter((_action, candidateIndex) => candidateIndex !== index),
                  )
                }
                onMove={(offset) =>
                  setActions((current) => {
                    const target = index + offset;
                    if (target < 0 || target >= current.length) return current;
                    const next = [...current];
                    const [moved] = next.splice(index, 1);
                    if (!moved) return current;
                    next.splice(target, 0, moved);
                    return next;
                  })
                }
              />
            ))}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={actions.length >= 20}
                onClick={() =>
                  setActions((current) => {
                    const added = freshButtonAction(
                      nextDatabaseButtonActionId(current.map((action) => action.id)),
                      'update_record',
                      source,
                    );
                    return added ? [...current, added] : current;
                  })
                }
              >
                <Plus aria-hidden="true" />
                <Trans>Add step</Trans>
              </Button>
            </div>
          </div>

          {issues.length > 0 ? (
            <div
              className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm"
              role="alert"
            >
              {issues.map((issue) => (
                <div key={issue} className="flex gap-2">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{issue}</span>
                </div>
              ))}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            disabled={labelMissing || confirmationIncomplete || issues.length > 0}
            onClick={() => onSave(candidate)}
          >
            <Trans>Review change</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

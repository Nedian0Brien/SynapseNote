import type { Config, ConfigBinding } from '@nedian0brien/synapsenote-core';
import { Form } from '@/components/ui/form';
import type { SettingsFieldDef, SettingsScope } from '../settings-types';
import { useConfigForm } from '../use-config-form';
import { useConfigValidationFeedback } from './config-validation-feedback';
import { SettingsField } from './settings-field';

interface BoundSchemaSectionProps {
  title: string;
  description: string;
  scope: SettingsScope;
  binding: ConfigBinding;
  fields: SettingsFieldDef[];
}

export function BoundSchemaSection({
  title,
  description,
  scope,
  binding,
  fields,
}: BoundSchemaSectionProps) {
  const { form, commitField } = useConfigForm(binding);
  const flashedPath = useConfigValidationFeedback(scope, form);
  return (
    <Form {...form}>
      <SchemaSection
        title={title}
        description={description}
        scope={scope}
        fields={fields}
        commitField={commitField}
        flashedPath={flashedPath}
      />
    </Form>
  );
}

function SchemaSection({
  title,
  description,
  scope,
  fields,
  commitField,
  flashedPath,
}: {
  title: string;
  description: string;
  scope: SettingsScope;
  fields: SettingsFieldDef[];
  commitField: (name: import('react-hook-form').FieldPath<Config>) => boolean;
  flashedPath: string | null;
}) {
  const titleId = `settings-section-${scope}-title`;
  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <div className="space-y-1">
        <h3 id={titleId} className="text-base font-semibold">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-10">
        {fields.map((field) => (
          <SettingsField
            key={field.path.join('.')}
            field={field}
            scope={scope}
            commitField={commitField}
            isFlashed={flashedPath === field.path.join('.')}
          />
        ))}
      </div>
    </section>
  );
}

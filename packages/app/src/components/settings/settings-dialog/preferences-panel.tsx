import { useLingui } from '@lingui/react/macro';
import type { ConfigBinding } from '@nedian0brien/synapsenote-core';
import { FIELDS_USER_PREFERENCES } from '../SettingsSchemaRegistry';
import { AttachmentsSection } from './attachments-section';
import { BoundSchemaSection } from './schema-settings-section';
import { SectionSkeleton } from './section-skeleton';

export function PreferencesPanel({ userBinding }: { userBinding: ConfigBinding | null }) {
  const { t } = useLingui();
  return (
    <div className="space-y-8">
      {userBinding ? (
        <BoundSchemaSection
          title={t`Preferences`}
          description={t`Customize how the editor looks and behaves.`}
          scope="user"
          binding={userBinding}
          fields={FIELDS_USER_PREFERENCES}
        />
      ) : (
        <SectionSkeleton />
      )}
      <AttachmentsSection />
    </div>
  );
}

import { AccountSection } from '../AccountSection';
import { AiToolsSection } from '../AiToolsSection';
import { EmbeddingsKeySection } from '../EmbeddingsKeySection';
import { OkignoreSection } from '../OkignoreSection';
import { ProjectAiToolsSection } from '../ProjectAiToolsSection';
import { ProjectTemplatesSection } from '../ProjectTemplatesSection';
import { SearchSection } from '../SearchSection';
import { SharingSection } from '../SharingSection';
import { SkillsManagerSection } from '../SkillsManagerSection';
import type { SettingsDialogBodyProps } from '../settings-types';
import { TerminalSection } from '../TerminalSection';
import { HotkeysSection } from './hotkeys-section';
import { IntegrationsSection } from './integrations-section';
import { PreferencesPanel } from './preferences-panel';
import { SyncSection } from './sync-section';

/** The sole owner of sidebar id to panel mapping. */
export function renderSettingsDialogSection({
  activeId,
  userBinding,
  okignoreBinding,
  okignoreSynced,
}: SettingsDialogBodyProps) {
  switch (activeId) {
    case 'preferences':
      return <PreferencesPanel userBinding={userBinding} />;
    case 'hotkeys':
      return <HotkeysSection />;
    case 'account':
      return (
        <div className="space-y-8">
          <AccountSection />
          <EmbeddingsKeySection />
        </div>
      );
    case 'sync':
      return <SyncSection />;
    case 'search':
      return <SearchSection />;
    case 'terminal':
      return <TerminalSection />;
    case 'project-templates':
      return <ProjectTemplatesSection />;
    case 'skills':
      return <SkillsManagerSection />;
    case 'sharing':
      return <SharingSection />;
    case 'okignore':
      return <OkignoreSection binding={okignoreBinding} synced={okignoreSynced} />;
    case 'ai-tools':
      return <AiToolsSection />;
    case 'project-ai-tools':
      return <ProjectAiToolsSection />;
    case 'claude-desktop':
      return <IntegrationsSection />;
    default:
      return null;
  }
}

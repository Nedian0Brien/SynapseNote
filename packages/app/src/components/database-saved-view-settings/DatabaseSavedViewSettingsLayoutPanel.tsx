import { DatabaseDashboardSettings } from '@/components/DatabaseDashboardSettings';
import { DatabaseFeedSettings } from '@/components/DatabaseFeedSettings';
import { DatabaseFormSettings } from '@/components/DatabaseFormSettings';
import { DatabaseSavedViewSettingsBoardPanel } from './DatabaseSavedViewSettingsBoardPanel';
import { DatabaseSavedViewSettingsCalendarPanel } from './DatabaseSavedViewSettingsCalendarPanel';
import { DatabaseSavedViewSettingsChartPanel } from './DatabaseSavedViewSettingsChartPanel';
import { DatabaseSavedViewSettingsGalleryPanel } from './DatabaseSavedViewSettingsGalleryPanel';
import { DatabaseSavedViewSettingsListPanel } from './DatabaseSavedViewSettingsListPanel';
import { DatabaseSavedViewSettingsMapPanel } from './DatabaseSavedViewSettingsMapPanel';
import { DatabaseSavedViewSettingsTablePanel } from './DatabaseSavedViewSettingsTablePanel';
import { DatabaseSavedViewSettingsTimelinePanel } from './DatabaseSavedViewSettingsTimelinePanel';
import type { SavedViewSettingsPanelProps } from './database-saved-view-settings-types';

/** Dispatches the saved view's stable layout type to its focused settings panel. */
export function DatabaseSavedViewSettingsLayoutPanel({
  database,
  draft,
  setDraft,
  source,
  view,
}: SavedViewSettingsPanelProps) {
  const updateConfiguration = (configuration: typeof draft.layout.configuration) =>
    setDraft((current) => ({
      ...current,
      layout: { ...current.layout, configuration } as typeof current.layout,
    }));

  switch (draft.layout.type) {
    case 'table':
      return (
        <DatabaseSavedViewSettingsTablePanel
          configuration={draft.layout.configuration}
          onChange={updateConfiguration}
        />
      );
    case 'board':
      return (
        <DatabaseSavedViewSettingsBoardPanel
          configuration={draft.layout.configuration}
          onChange={updateConfiguration}
          source={source}
        />
      );
    case 'timeline':
      return (
        <DatabaseSavedViewSettingsTimelinePanel
          configuration={draft.layout.configuration}
          onChange={updateConfiguration}
          source={source}
        />
      );
    case 'calendar':
      return (
        <DatabaseSavedViewSettingsCalendarPanel
          configuration={draft.layout.configuration}
          onChange={updateConfiguration}
          source={source}
        />
      );
    case 'list':
      return (
        <DatabaseSavedViewSettingsListPanel
          configuration={draft.layout.configuration}
          onChange={updateConfiguration}
          source={source}
        />
      );
    case 'gallery':
      return (
        <DatabaseSavedViewSettingsGalleryPanel
          configuration={draft.layout.configuration}
          onChange={updateConfiguration}
          source={source}
        />
      );
    case 'chart':
      return (
        <DatabaseSavedViewSettingsChartPanel
          configuration={draft.layout.configuration}
          onChange={updateConfiguration}
          source={source}
        />
      );
    case 'form':
      return (
        <DatabaseFormSettings
          source={source}
          value={draft.layout.configuration}
          onChange={updateConfiguration}
        />
      );
    case 'map':
      return (
        <DatabaseSavedViewSettingsMapPanel
          configuration={draft.layout.configuration}
          onChange={updateConfiguration}
          source={source}
        />
      );
    case 'dashboard':
      return (
        <DatabaseDashboardSettings
          database={database ?? { sources: [source], views: [view] }}
          dashboardViewId={view.id}
          value={draft.layout.configuration}
          onChange={updateConfiguration}
        />
      );
    case 'feed':
      return (
        <DatabaseFeedSettings
          source={source}
          value={draft.layout.configuration}
          onChange={updateConfiguration}
        />
      );
    default:
      return null;
  }
}

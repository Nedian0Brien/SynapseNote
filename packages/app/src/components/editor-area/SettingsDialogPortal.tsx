import { SettingsDialogShell } from '@/components/settings/SettingsDialogShell';
import { useSettingsRoute } from '@/lib/use-settings-route';

/** State owner: settings route. Render owner: SettingsDialogPortal overlay. */
export function SettingsDialogPortal() {
  const settingsRoute = useSettingsRoute();
  return (
    <SettingsDialogShell
      open={settingsRoute.open}
      onOpenChange={(next) => {
        if (!next) settingsRoute.close();
      }}
    />
  );
}

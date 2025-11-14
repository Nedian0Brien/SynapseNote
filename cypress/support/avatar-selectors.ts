import { byTestId } from './selectors';

/**
 * Selectors for avatar-related UI elements
 * Following the existing selector pattern for consistency
 */
export const AvatarSelectors = {
  // Account Settings Dialog
  accountSettingsDialog: () => cy.get(byTestId('account-settings-dialog')),
  avatarUrlInput: () => cy.get(byTestId('avatar-url-input')),
  updateAvatarButton: () => cy.get(byTestId('update-avatar-button')),

  // Avatar Display Elements
  avatarImage: () => cy.get('[data-slot="avatar-image"]'),
  avatarFallback: () => cy.get('[data-slot="avatar-fallback"]'),

  // Workspace Dropdown Avatar
  workspaceDropdownAvatar: () => cy.get('[data-testid="workspace-dropdown"] [data-slot="avatar"]'),

  // Date/Time Format Dropdowns (in Account Settings)
  dateFormatDropdown: () => cy.get(byTestId('date-format-dropdown')),
  timeFormatDropdown: () => cy.get(byTestId('time-format-dropdown')),
  startWeekOnDropdown: () => cy.get(byTestId('start-week-on-dropdown')),
};

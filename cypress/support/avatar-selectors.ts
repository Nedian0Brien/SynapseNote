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
  avatarImage: () => cy.get('[data-testid="avatar-image"]'),
  avatarFallback: () => cy.get('[data-slot="avatar-fallback"]'),

  // Workspace Dropdown Avatar
  workspaceDropdownAvatar: () => cy.get('[data-testid="workspace-dropdown-trigger"] [data-slot="avatar"]'),

  // Header Avatars (Top Right Corner - Collaborative Users)
  headerAvatars: () => cy.get('.appflowy-top-bar [data-slot="avatar"]'),
  headerAvatarContainer: () => cy.get('.appflowy-top-bar').find('[class*="flex"][class*="-space-x-2"]').first(),
  headerAvatarImage: (index = 0) => cy.get('.appflowy-top-bar [data-slot="avatar"]').eq(index).find('[data-slot="avatar-image"]'),
  headerAvatarFallback: (index = 0) => cy.get('.appflowy-top-bar [data-slot="avatar"]').eq(index).find('[data-slot="avatar-fallback"]'),

  // Date/Time Format Dropdowns (in Account Settings)
  dateFormatDropdown: () => cy.get(byTestId('date-format-dropdown')),
  timeFormatDropdown: () => cy.get(byTestId('time-format-dropdown')),
  startWeekOnDropdown: () => cy.get(byTestId('start-week-on-dropdown')),
};

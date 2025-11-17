import { APP_EVENTS } from '../../../../src/application/constants';

import { updateUserMetadata, updateWorkspaceMemberAvatar } from '../../../support/api-utils';
import { AuthTestUtils } from '../../../support/auth-utils';
import { AvatarSelectors } from '../../../support/avatar-selectors';
import { dbUtils } from '../../../support/db-utils';
import { WorkspaceSelectors } from '../../../support/selectors';
import { generateRandomEmail, getTestEnvironment } from '../../../support/test-config';

const appflowyEnv = getTestEnvironment();

/**
 * Shared utilities and setup for avatar tests
 */
export const avatarTestUtils = {
  generateRandomEmail,
  APPFLOWY_BASE_URL: appflowyEnv.appflowyBaseUrl,

  /**
   * Common beforeEach setup for avatar tests
   */
  setupBeforeEach: () => {
    // Suppress known transient errors
    cy.on('uncaught:exception', (err) => {
      if (
        err.message.includes('Minified React error') ||
        err.message.includes('View not found') ||
        err.message.includes('No workspace or service found')
      ) {
        return false;
      }

      return true;
    });
    cy.viewport(1280, 720);
  },

  /**
   * Common imports for avatar tests
   */
  imports: {
    APP_EVENTS,
    updateUserMetadata,
    updateWorkspaceMemberAvatar,
    AuthTestUtils,
    AvatarSelectors,
    dbUtils,
    WorkspaceSelectors,
  },
};

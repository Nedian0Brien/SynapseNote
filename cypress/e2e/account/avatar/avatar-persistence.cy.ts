import { avatarTestUtils } from './avatar-test-utils';
import { byTestId } from '../../../support/selectors';
import { testLog } from '../../../support/test-helpers';

const { generateRandomEmail, setupBeforeEach, imports } = avatarTestUtils;
const { updateWorkspaceMemberAvatar, AuthTestUtils, AvatarSelectors, dbUtils, WorkspaceSelectors } = imports;

describe('Avatar Persistence', () => {
  beforeEach(() => {
    setupBeforeEach();
  });

  it('should persist avatar across page reloads', () => {
    const testEmail = generateRandomEmail();
    const authUtils = new AuthTestUtils();
    const testAvatarUrl = 'https://api.dicebear.com/7.x/avataaars/svg?seed=persist';

    testLog.info( 'Step 1: Visit login page');
    cy.visit('/login', { failOnStatusCode: false });
    cy.wait(2000);

    testLog.info( 'Step 2: Sign in with test account');
    authUtils.signInWithTestUrl(testEmail).then(() => {
      cy.url({ timeout: 30000 }).should('include', '/app');
      cy.wait(3000);

      testLog.info( 'Step 3: Set avatar via workspace member profile API');
      dbUtils.getCurrentWorkspaceId().then((workspaceId) => {
        expect(workspaceId).to.not.be.null;

        updateWorkspaceMemberAvatar(workspaceId!, testAvatarUrl).then((response) => {
          expect(response.status).to.equal(200);
        });

        cy.wait(2000);

        testLog.info( 'Step 4: Reload page');
        cy.reload();
        cy.wait(3000);

        testLog.info( 'Step 5: Verify avatar persisted');
        WorkspaceSelectors.dropdownTrigger().click();
        cy.wait(1000);
        cy.get(byTestId('account-settings-button')).click();
        AvatarSelectors.accountSettingsDialog().should('be.visible');

        AvatarSelectors.avatarImage().should('exist').and('have.attr', 'src', testAvatarUrl);

        testLog.info( 'Step 6: Reload again to verify persistence');
        cy.reload();
        cy.wait(3000);

        WorkspaceSelectors.dropdownTrigger().click();
        cy.wait(1000);
        cy.get(byTestId('account-settings-button')).click();
        AvatarSelectors.accountSettingsDialog().should('be.visible');

        AvatarSelectors.avatarImage().should('exist').and('have.attr', 'src', testAvatarUrl);
      });
    });
  });
});

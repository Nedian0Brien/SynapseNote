import { avatarTestUtils } from './avatar-test-utils';

const { generateRandomEmail, setupBeforeEach, imports } = avatarTestUtils;
const { updateUserMetadata, updateWorkspaceMemberAvatar, AuthTestUtils, AvatarSelectors, dbUtils, WorkspaceSelectors } = imports;

describe('Avatar Priority', () => {
  beforeEach(() => {
    setupBeforeEach();
  });

  it('should prioritize workspace avatar over user metadata avatar', () => {
    const testEmail = generateRandomEmail();
    const authUtils = new AuthTestUtils();
    const userMetadataAvatar = 'https://api.dicebear.com/7.x/avataaars/svg?seed=user-metadata';
    const workspaceAvatar = 'https://api.dicebear.com/7.x/avataaars/svg?seed=workspace';

    cy.task('log', 'Step 1: Visit login page');
    cy.visit('/login', { failOnStatusCode: false });
    cy.wait(2000);

    cy.task('log', 'Step 2: Sign in with test account');
    authUtils.signInWithTestUrl(testEmail).then(() => {
      cy.url({ timeout: 30000 }).should('include', '/app');
      cy.wait(3000);

      cy.task('log', 'Step 3: Set user metadata avatar');
      updateUserMetadata(userMetadataAvatar).then((response) => {
        expect(response.status).to.equal(200);
      });

      cy.wait(2000);

      cy.task('log', 'Step 4: Set workspace member avatar');
      dbUtils.getCurrentWorkspaceId().then((workspaceId) => {
        expect(workspaceId).to.not.be.null;

        updateWorkspaceMemberAvatar(workspaceId!, workspaceAvatar).then((response) => {
          expect(response.status).to.equal(200);
        });

        cy.wait(2000);
        cy.reload();
        cy.wait(3000);

        cy.task('log', 'Step 5: Verify workspace avatar is displayed (priority)');
        WorkspaceSelectors.dropdownTrigger().click();
        cy.wait(1000);
        cy.get('[data-testid="account-settings-button"]').click();
        AvatarSelectors.accountSettingsDialog().should('be.visible');

        // Workspace avatar should be displayed, not user metadata avatar
        AvatarSelectors.avatarImage().should('exist').and('have.attr', 'src', workspaceAvatar);
      });
    });
  });
});


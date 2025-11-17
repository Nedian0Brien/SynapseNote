import { avatarTestUtils } from './avatar-test-utils';
import { testLog } from '../../../support/test-helpers';

const { generateRandomEmail, setupBeforeEach, imports } = avatarTestUtils;
const { updateWorkspaceMemberAvatar, AuthTestUtils, dbUtils } = imports;

describe('Avatar Database', () => {
  beforeEach(() => {
    setupBeforeEach();
  });

  describe('Database Verification', () => {
    it('should store avatar in workspace_member_profiles table', () => {
      const testEmail = generateRandomEmail();
      const authUtils = new AuthTestUtils();
      const testAvatarUrl = 'https://api.dicebear.com/7.x/avataaars/svg?seed=db-test';

      testLog.info( 'Step 1: Visit login page');
      cy.visit('/login', { failOnStatusCode: false });
      cy.wait(2000);

      testLog.info( 'Step 2: Sign in with test account');
      authUtils.signInWithTestUrl(testEmail).then(() => {
        cy.url({ timeout: 30000 }).should('include', '/app');
        cy.wait(3000);

        testLog.info( 'Step 3: Set avatar via API');
        dbUtils.getCurrentWorkspaceId().then((workspaceId) => {
          expect(workspaceId).to.not.be.null;

          updateWorkspaceMemberAvatar(workspaceId!, testAvatarUrl).then((response) => {
            expect(response.status).to.equal(200);
          });

          cy.wait(3000);

          testLog.info( 'Step 4: Verify avatar is stored in database');
          dbUtils.getCurrentUserUuid().then((userUuid) => {
            expect(userUuid).to.not.be.null;

            dbUtils.getWorkspaceMemberProfile(workspaceId!, userUuid!).then((profile) => {
              expect(profile).to.not.be.null;
              expect(profile?.avatar_url).to.equal(testAvatarUrl);
              expect(profile?.workspace_id).to.equal(workspaceId);
              expect(profile?.user_uuid).to.equal(userUuid);
            });
          });
        });
      });
    });
  });
});


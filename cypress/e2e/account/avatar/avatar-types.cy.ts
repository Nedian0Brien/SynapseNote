import { avatarTestUtils } from './avatar-test-utils';
import { byTestId } from '../../../support/selectors';
import { testLog } from '../../../support/test-helpers';

const { generateRandomEmail, setupBeforeEach, imports } = avatarTestUtils;
const { updateWorkspaceMemberAvatar, AuthTestUtils, AvatarSelectors, dbUtils, WorkspaceSelectors } = imports;

describe('Avatar Types', () => {
    beforeEach(() => {
        setupBeforeEach();
    });

    it('should handle different avatar URL types (HTTP, HTTPS, data URL)', () => {
        const testEmail = generateRandomEmail();
        const authUtils = new AuthTestUtils();
        const httpsAvatar = 'https://api.dicebear.com/7.x/avataaars/svg?seed=https';

        testLog.info( 'Step 1: Visit login page');
        cy.visit('/login', { failOnStatusCode: false });
        cy.wait(2000);

        testLog.info( 'Step 2: Sign in with test account');
        authUtils.signInWithTestUrl(testEmail).then(() => {
            cy.url({ timeout: 30000 }).should('include', '/app');
            cy.wait(3000);

            testLog.info( 'Step 3: Test HTTPS avatar URL');
            dbUtils.getCurrentWorkspaceId().then((workspaceId) => {
                expect(workspaceId).to.not.be.null;

                updateWorkspaceMemberAvatar(workspaceId!, httpsAvatar).then((response) => {
                    expect(response.status).to.equal(200);
                });

                cy.wait(2000);
                cy.reload();
                cy.wait(3000);

                WorkspaceSelectors.dropdownTrigger().click();
                cy.wait(1000);
                cy.get(byTestId('account-settings-button')).click();
                AvatarSelectors.accountSettingsDialog().should('be.visible');

                AvatarSelectors.avatarImage().should('exist').and('have.attr', 'src', httpsAvatar);
            });
        });
    });

    it('should handle emoji avatars correctly', () => {
        const testEmail = generateRandomEmail();
        const authUtils = new AuthTestUtils();
        const emojiAvatars = ['🎨', '🚀', '⭐', '🎯'];

        testLog.info( 'Step 1: Visit login page');
        cy.visit('/login', { failOnStatusCode: false });
        cy.wait(2000);

        testLog.info( 'Step 2: Sign in with test account');
        authUtils.signInWithTestUrl(testEmail).then(() => {
            cy.url({ timeout: 30000 }).should('include', '/app');
            cy.wait(3000);

            testLog.info( 'Step 3: Test each emoji avatar');
            dbUtils.getCurrentWorkspaceId().then((workspaceId) => {
                expect(workspaceId).to.not.be.null;

                emojiAvatars.forEach((emoji, index) => {
                    updateWorkspaceMemberAvatar(workspaceId!, emoji).then((response) => {
                        expect(response.status).to.equal(200);
                    });

                    cy.wait(2000);
                    cy.reload();
                    cy.wait(3000);

                    WorkspaceSelectors.dropdownTrigger().click();
                    cy.wait(1000);
                    cy.get(byTestId('account-settings-button')).click();
                    AvatarSelectors.accountSettingsDialog().should('be.visible');

                    // Emoji should be displayed in fallback, not as image
                    AvatarSelectors.avatarFallback().should('contain.text', emoji);
                });
            });
        });
    });
});

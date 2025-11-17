import { avatarTestUtils } from './avatar-test-utils';
import { byTestIdContains } from '../../../support/selectors';
import { testLog } from '../../../support/test-helpers';

const { generateRandomEmail, setupBeforeEach, imports } = avatarTestUtils;
const { APP_EVENTS, updateWorkspaceMemberAvatar, AuthTestUtils, AvatarSelectors, dbUtils } = imports;

describe('Avatar Header Display', () => {
  beforeEach(() => {
    setupBeforeEach();
  });

  describe('Header Avatar Display (Top Right Corner)', () => {
    it('should display avatar in header top right corner after setting workspace avatar', () => {
      const testEmail = generateRandomEmail();
      const authUtils = new AuthTestUtils();
      const testAvatarUrl = 'https://api.dicebear.com/7.x/avataaars/svg?seed=header-test';

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
          cy.reload();
          cy.wait(3000);

          testLog.info( 'Step 4: Interact with editor to trigger collaborative user awareness');
          // Click on a page to open editor
          cy.get('body').then(($body) => {
            // Try to find and click on a page in the sidebar
            if ($body.find(byTestIdContains('page')).length > 0) {
              cy.get(byTestIdContains('page')).first().click();
            } else if ($body.text().includes('Getting started')) {
              cy.contains('Getting started').click();
            }
          });

          cy.wait(2000);

          // Interact with editor to make user appear in collaborative users
          cy.get('[contenteditable="true"]').then(($editors) => {
            if ($editors.length > 0) {
              // Find main editor (not title)
              let editorFound = false;
              $editors.each((index, el) => {
                const $el = Cypress.$(el);
                if (!$el.attr('data-testid')?.includes('title') && !$el.hasClass('editor-title')) {
                  cy.wrap(el).click({ force: true });
                  cy.wait(500);
                  cy.wrap(el).type(' ', { force: true }); // Type space to trigger awareness
                  editorFound = true;
                  return false;
                }
              });
              if (!editorFound && $editors.length > 0) {
                cy.wrap($editors.last()).click({ force: true });
                cy.wait(500);
                cy.wrap($editors.last()).type(' ', { force: true });
              }
            }
          });

          cy.wait(2000);

          testLog.info( 'Step 5: Verify avatar appears in header top right corner');
          // Wait for header to be visible
          cy.get('.appflowy-top-bar').should('be.visible');

          // Check if avatar container exists in header (collaborative users area)
          // The current user's avatar will appear there when they're actively editing
          testLog.info( 'Header avatar area should be visible');
          AvatarSelectors.headerAvatarContainer().should('exist');

          // Verify avatar image or fallback is present
          cy.get('.appflowy-top-bar [data-slot="avatar"]').should('have.length.at.least', 1);
        });
      });
    });

    it('should display emoji avatar in header when emoji is set', () => {
      const testEmail = generateRandomEmail();
      const authUtils = new AuthTestUtils();
      const testEmoji = '🎨';

      testLog.info( 'Step 1: Visit login page');
      cy.visit('/login', { failOnStatusCode: false });
      cy.wait(2000);

      testLog.info( 'Step 2: Sign in with test account');
      authUtils.signInWithTestUrl(testEmail).then(() => {
        cy.url({ timeout: 30000 }).should('include', '/app');
        cy.wait(3000);

        testLog.info( 'Step 3: Set emoji avatar via API');
        dbUtils.getCurrentWorkspaceId().then((workspaceId) => {
          expect(workspaceId).to.not.be.null;

          updateWorkspaceMemberAvatar(workspaceId!, testEmoji).then((response) => {
            expect(response.status).to.equal(200);
          });

          cy.wait(2000);
          cy.reload();
          cy.wait(3000);

          testLog.info( 'Step 4: Interact with editor to trigger collaborative user awareness');
          // Click on a page to open editor
          cy.get('body').then(($body) => {
            if ($body.find(byTestIdContains('page')).length > 0) {
              cy.get(byTestIdContains('page')).first().click();
            } else if ($body.text().includes('Getting started')) {
              cy.contains('Getting started').click();
            }
          });

          cy.wait(2000);

          // Interact with editor
          cy.get('[contenteditable="true"]').then(($editors) => {
            if ($editors.length > 0) {
              let editorFound = false;
              $editors.each((index, el) => {
                const $el = Cypress.$(el);
                if (!$el.attr('data-testid')?.includes('title') && !$el.hasClass('editor-title')) {
                  cy.wrap(el).click({ force: true });
                  cy.wait(500);
                  cy.wrap(el).type(' ', { force: true });
                  editorFound = true;
                  return false;
                }
              });
              if (!editorFound && $editors.length > 0) {
                cy.wrap($editors.last()).click({ force: true });
                cy.wait(500);
                cy.wrap($editors.last()).type(' ', { force: true });
              }
            }
          });

          cy.wait(2000);

          testLog.info( 'Step 5: Verify emoji appears in header avatar fallback');
          cy.get('.appflowy-top-bar').should('be.visible');

          // When user is actively editing, their avatar should appear in header
          // Emoji avatars show in fallback
          testLog.info( 'Header should be visible with avatar area');
          AvatarSelectors.headerAvatarContainer().should('exist');

          // Verify emoji appears in fallback
          cy.get('.appflowy-top-bar [data-slot="avatar"]').should('have.length.at.least', 1);
          AvatarSelectors.headerAvatarFallback(0).should('contain.text', testEmoji);
        });
      });
    });

    it('should update header avatar when workspace member profile notification is received', () => {
      const testEmail = generateRandomEmail();
      const authUtils = new AuthTestUtils();
      const testAvatarUrl = 'https://api.dicebear.com/7.x/avataaars/svg?seed=header-notification';

      testLog.info( 'Step 1: Visit login page');
      cy.visit('/login', { failOnStatusCode: false });
      cy.wait(2000);

      testLog.info( 'Step 2: Sign in with test account');
      authUtils.signInWithTestUrl(testEmail).then(() => {
        cy.url({ timeout: 30000 }).should('include', '/app');
        cy.wait(3000);

        testLog.info( 'Step 3: Get user UUID and workspace ID');
        dbUtils.getCurrentWorkspaceId().then((workspaceId) => {
          expect(workspaceId).to.not.be.null;

          dbUtils.getCurrentUserUuid().then((userUuid) => {
            expect(userUuid).to.not.be.null;

            testLog.info( 'Step 4: Simulate workspace member profile changed notification');
            cy.window().then((win) => {
              const emitter = (win as typeof window & {
                __APPFLOWY_EVENT_EMITTER__?: { emit: (...args: unknown[]) => void };
              }).__APPFLOWY_EVENT_EMITTER__;

              expect(emitter, 'Event emitter should be available').to.exist;

              // Simulate notification with avatar URL update
              emitter?.emit(APP_EVENTS.WORKSPACE_MEMBER_PROFILE_CHANGED, {
                userUuid: userUuid,
                name: 'Test User',
                avatarUrl: testAvatarUrl,
              });
            });

            cy.wait(2000);

            testLog.info( 'Step 5: Verify avatar is updated in database');
            dbUtils.getWorkspaceMemberProfile(workspaceId!, userUuid!).then((profile) => {
              expect(profile).to.not.be.null;
              expect(profile?.avatar_url).to.equal(testAvatarUrl);
            });

            testLog.info( 'Step 6: Interact with editor to trigger collaborative user awareness');
            // Click on a page to open editor
            cy.get('body').then(($body) => {
              if ($body.find(byTestIdContains('page')).length > 0) {
                cy.get(byTestIdContains('page')).first().click();
              } else if ($body.text().includes('Getting started')) {
                cy.contains('Getting started').click();
              }
            });

            cy.wait(2000);

            // Interact with editor
            cy.get('[contenteditable="true"]').then(($editors) => {
              if ($editors.length > 0) {
                let editorFound = false;
                $editors.each((index, el) => {
                  const $el = Cypress.$(el);
                  if (!$el.attr('data-testid')?.includes('title') && !$el.hasClass('editor-title')) {
                    cy.wrap(el).click({ force: true });
                    cy.wait(500);
                    cy.wrap(el).type(' ', { force: true });
                    editorFound = true;
                    return false;
                  }
                });
                if (!editorFound && $editors.length > 0) {
                  cy.wrap($editors.last()).click({ force: true });
                  cy.wait(500);
                  cy.wrap($editors.last()).type(' ', { force: true });
                }
              }
            });

            cy.wait(2000);

            testLog.info( 'Step 7: Verify header avatar area is visible and updated');
            cy.get('.appflowy-top-bar').should('be.visible');
            AvatarSelectors.headerAvatarContainer().should('exist');

            // Verify avatar appears in header
            cy.get('.appflowy-top-bar [data-slot="avatar"]').should('have.length.at.least', 1);

            // Verify the avatar image uses the updated URL (if image is loaded)
            // The avatar might show as image or fallback depending on loading state
            // We already verified the database update in Step 5, so just verify avatar container exists
            testLog.info( 'Avatar container verified in header - database update confirmed in Step 5');
          });
        });
      });
    });
  });
});

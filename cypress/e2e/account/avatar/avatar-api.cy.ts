import { avatarTestUtils } from './avatar-test-utils';

const { generateRandomEmail, setupBeforeEach, imports } = avatarTestUtils;
const { updateUserMetadata, AuthTestUtils, AvatarSelectors, WorkspaceSelectors } = imports;

describe('Avatar API', () => {
  beforeEach(() => {
    setupBeforeEach();
  });

  describe('Avatar Upload via API', () => {
    it('should update avatar URL via API and display in UI', () => {
      const testEmail = generateRandomEmail();
      const authUtils = new AuthTestUtils();
      const testAvatarUrl = 'https://api.dicebear.com/7.x/avataaars/svg?seed=test';

      cy.task('log', 'Step 1: Visit login page');
      cy.visit('/login', { failOnStatusCode: false });
      cy.wait(2000);

      cy.task('log', 'Step 2: Sign in with test account');
      authUtils.signInWithTestUrl(testEmail);

      cy.url({ timeout: 30000 }).should('include', '/app');
      cy.wait(3000);

      cy.task('log', 'Step 3: Update avatar via API');
      updateUserMetadata(testAvatarUrl).then((response) => {
        cy.task('log', `API Response: ${JSON.stringify(response)}`);
        expect(response.status).to.equal(200);
      });

      cy.task('log', 'Step 4: Reload page to see updated avatar');
      cy.reload();
      cy.wait(3000);

      cy.task('log', 'Step 5: Open Account Settings to verify avatar');
      WorkspaceSelectors.dropdownTrigger().click();
      cy.wait(1000);
      cy.get('[data-testid="account-settings-button"]').click();
      AvatarSelectors.accountSettingsDialog().should('be.visible');

      cy.task('log', 'Step 6: Verify avatar image is displayed in Account Settings');
      // Note: Account Settings dialog may not display avatar directly
      // The avatar is displayed via getUserIconUrl which prioritizes workspace member avatar
      // Since we updated user metadata (icon_url), it should be available
      // But the actual display location might be in the workspace dropdown or elsewhere

      // Wait for any avatar image to be present and loaded
      // The AvatarImage component loads asynchronously and sets opacity to 0 while loading
      cy.get('[data-testid="avatar-image"]', { timeout: 10000 })
        .should('exist')
        .should(($imgs) => {
          // Find the first visible avatar image (opacity not 0)
          let foundVisible = false;
          $imgs.each((index, img) => {
            const $img = Cypress.$(img);
            const opacity = $img.css('opacity');
            const src = $img.attr('src');
            if (opacity !== '0' && src && src.length > 0) {
              foundVisible = true;
              return false; // break
            }
          });
          expect(foundVisible, 'At least one avatar image should be visible').to.be.true;
        });

      // Verify that the avatar image has loaded (check for non-empty src and visible state)
      cy.get('[data-testid="avatar-image"]').then(($imgs) => {
        let foundLoaded = false;
        $imgs.each((index, img) => {
          const $img = Cypress.$(img);
          const opacity = parseFloat($img.css('opacity') || '0');
          const src = $img.attr('src') || '';

          if (opacity > 0 && src.length > 0) {
            foundLoaded = true;
            cy.task('log', `Found loaded avatar image with src: ${src.substring(0, 50)}...`);
            return false; // break
          }
        });
        expect(foundLoaded, 'At least one avatar image should be loaded and visible').to.be.true;
      });
    });

    it('test direct API call', () => {
      const testEmail = generateRandomEmail();
      const authUtils = new AuthTestUtils();
      const testAvatarUrl = 'https://api.dicebear.com/7.x/avataaars/svg?seed=test';

      cy.task('log', '========== Step 1: Visit login page ==========');
      cy.visit('/login', { failOnStatusCode: false });
      cy.wait(2000);

      cy.task('log', '========== Step 2: Sign in with test account ==========');
      authUtils.signInWithTestUrl(testEmail);
      cy.url({ timeout: 30000 }).should('include', '/app');
      cy.wait(3000);

      cy.task('log', '========== Step 3: Get token from localStorage ==========');
      cy.window()
        .its('localStorage')
        .invoke('getItem', 'token')
        .then((tokenStr) => {
          cy.task('log', `Token string: ${tokenStr ? 'Found' : 'Not found'}`);
          const token = JSON.parse(tokenStr);
          const accessToken = token.access_token;
          cy.task('log', `Access token: ${accessToken ? 'Present (length: ' + accessToken.length + ')' : 'Missing'}`);
        });

      cy.task('log', '========== Step 4: Making API request ==========');
      cy.task('log', `URL: ${avatarTestUtils.APPFLOWY_BASE_URL}/api/user/update`);
      cy.task('log', `Avatar URL: ${testAvatarUrl}`);

      updateUserMetadata(testAvatarUrl).then((response) => {
        cy.task('log', '========== Step 5: Checking response ==========');
        cy.task('log', `Response is null: ${response === null}`);
        cy.task('log', `Response type: ${typeof response}`);
        cy.task('log', `Response status: ${response?.status}`);
        cy.task('log', `Response body: ${JSON.stringify(response?.body)}`);
        cy.task('log', `Response headers: ${JSON.stringify(response?.headers)}`);

        expect(response).to.not.be.null;
        expect(response.status).to.equal(200);

        if (response.body) {
          cy.task('log', `Response body code: ${response.body.code}`);
          cy.task('log', `Response body message: ${response.body.message}`);
        }
      });
    });

    it('should display emoji as avatar via API', () => {
      const testEmail = generateRandomEmail();
      const authUtils = new AuthTestUtils();
      const testEmoji = '🎨';

      cy.task('log', 'Step 1: Visit login page');
      cy.visit('/login', { failOnStatusCode: false });
      cy.wait(2000);

      cy.task('log', 'Step 2: Sign in with test account');
      authUtils.signInWithTestUrl(testEmail);

      cy.url({ timeout: 30000 }).should('include', '/app');
      cy.wait(3000);

      cy.task('log', 'Step 3: Update avatar to emoji via API');
      updateUserMetadata(testEmoji).then((response) => {
        expect(response).to.not.be.null;
        expect(response.status).to.equal(200);
      });

      cy.task('log', 'Step 4: Reload page');
      cy.reload();
      cy.wait(3000);

      cy.task('log', 'Step 5: Open Account Settings');
      WorkspaceSelectors.dropdownTrigger().click();
      cy.wait(1000);
      cy.get('[data-testid="account-settings-button"]').click();
      AvatarSelectors.accountSettingsDialog().should('be.visible');

      cy.task('log', 'Step 6: Verify emoji is displayed in fallback');
      AvatarSelectors.avatarFallback().should('contain.text', testEmoji);
    });

    it('should display fallback character when no avatar is set', () => {
      const testEmail = generateRandomEmail();
      const authUtils = new AuthTestUtils();

      cy.task('log', 'Step 1: Visit login page');
      cy.visit('/login', { failOnStatusCode: false });
      cy.wait(2000);

      cy.task('log', 'Step 2: Sign in with test account (no avatar set)');
      authUtils.signInWithTestUrl(testEmail).then(() => {
        cy.url({ timeout: 30000 }).should('include', '/app');
        cy.wait(3000);

        cy.task('log', 'Step 3: Open workspace dropdown to see avatar');
        WorkspaceSelectors.dropdownTrigger().click();
        cy.wait(500);

        cy.task('log', 'Step 4: Verify fallback is displayed in workspace dropdown avatar');
        AvatarSelectors.workspaceDropdownAvatar().within(() => {
          AvatarSelectors.avatarFallback().should('be.visible');
        });
      });
    });
  });
});


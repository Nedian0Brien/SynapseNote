import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';

describe('Login Feature Tests with Authentication', () => {
    const AF_BASE_URL = Cypress.env('AF_BASE_URL');
    const AF_GOTRUE_URL = Cypress.env('AF_GOTRUE_URL');
    const generateRandomEmail = () => `${uuidv4()}@appflowy.io`;

    before(() => {
        // Log environment configuration for debugging
        cy.task('log', `Test Environment Configuration:
          - AF_BASE_URL: ${AF_BASE_URL}
          - AF_GOTRUE_URL: ${AF_GOTRUE_URL}
          - Running in CI: ${Cypress.env('CI')}
          - Use Real Backend: ${Cypress.env('USE_REAL_BACKEND')}`);

    });

    describe('LoginAuth Component Tests', () => {
        it('should generate and exchange tokens for authentication', () => {
            const randomEmail = generateRandomEmail();
            const authUtils = new AuthTestUtils();

            cy.task('log', `Testing token generation and exchange for: ${randomEmail}`);

            // Generate sign-in URL and verify token exchange
            authUtils.generateSignInUrl(randomEmail).then((signInUrl) => {
                expect(signInUrl).to.include('#access_token=');
                expect(signInUrl).to.include('refresh_token=');

                cy.task('log', `Generated sign-in URL with tokens for ${randomEmail}`);

                // Extract tokens from the URL
                const fragment = signInUrl.split('#')[1];
                const params = new URLSearchParams(fragment);
                const refreshToken = params.get('refresh_token');
                const accessToken = params.get('access_token');

                expect(refreshToken).to.exist;
                expect(accessToken).to.exist;

                // Test the refresh token exchange
                cy.request({
                    method: 'POST',
                    url: `${AF_GOTRUE_URL}/token?grant_type=refresh_token`,
                    body: {
                        refresh_token: refreshToken,
                    },
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }).then((response) => {
                    expect(response.status).to.equal(200);
                    expect(response.body.access_token).to.exist;
                    expect(response.body.refresh_token).to.exist;
                    expect(response.body.user).to.exist;

                    cy.task('log', `Successfully exchanged refresh token for user: ${response.body.user.email}`);
                });
            });
        });

        it('should show AppFlowy Web login page and authenticate', () => {
            // Handle uncaught exceptions during workspace creation
            cy.on('uncaught:exception', (err, runnable) => {
                // Ignore "No workspace or service found" error which happens before workspace is created
                if (err.message.includes('No workspace or service found')) {
                    return false;
                }
                // Let other errors fail the test
                return true;
            });

            // Visit the AppFlowy Web login page
            cy.visit('/login', { failOnStatusCode: false });

            // Wait for the page to load
            cy.wait(2000);

            // Check if we're on the login page or if login UI is visible
            cy.url().then((url) => {
                cy.task('log', `Current URL: ${url}`);

                // Look for common login elements
                // This might include login buttons, email inputs, etc.
                cy.get('body').then(($body) => {
                    // Log what we see on the page
                    cy.task('log', `Page title: ${$body.find('title').text() || document.title}`);

                    // Try to find login-related elements
                    const hasLoginButton = $body.find('button:contains("Login"), button:contains("Sign in"), button:contains("Sign In")').length > 0;
                    const hasEmailInput = $body.find('input[type="email"], input[name="email"]').length > 0 ||
                        $body.find('input').filter(function () {
                            return $(this).attr('placeholder')?.toLowerCase().includes('email');
                        }).length > 0;

                    if (hasLoginButton || hasEmailInput) {
                        cy.task('log', 'Login page elements found');
                    } else {
                        cy.task('log', 'No obvious login elements found - checking for other auth indicators');
                    }
                });
            });

            // Now test the authentication flow using signInWithTestUrl
            const randomEmail = generateRandomEmail();
            const authUtils = new AuthTestUtils();

            cy.task('log', `Testing authentication for: ${randomEmail}`);

            // Use the signInWithTestUrl method which handles the complete flow
            authUtils.signInWithTestUrl(randomEmail).then(() => {
                // Verify authentication was successful
                cy.window().then((win) => {
                    const token = win.localStorage.getItem('token');
                    expect(token).to.exist;

                    const tokenData = JSON.parse(token!);
                    expect(tokenData.access_token).to.exist;
                    expect(tokenData.refresh_token).to.exist;
                    expect(tokenData.user).to.exist;

                    cy.task('log', `Successfully authenticated user: ${tokenData.user.email}`);
                });

                // Verify we're on the app page
                cy.url().should('include', '/app');

                cy.task('log', 'Authentication flow completed successfully');
            });
            cy.wait(2000);
        });


    });

});
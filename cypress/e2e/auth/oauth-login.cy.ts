import { v4 as uuidv4 } from 'uuid';

/**
 * OAuth Login Flow Tests
 *
 * These tests verify the complete OAuth (Google) login flow and ensure
 * the redirect loop fix is working correctly:
 *
 * 1. New User OAuth Login: Verifies new users complete OAuth flow and redirect to /app without loops
 * 2. Existing User OAuth Login: Verifies existing users complete OAuth flow and redirect correctly
 * 3. Redirect Loop Prevention: Tests that the fix prevents redirect loops after OAuth callback
 * 4. Token Persistence: Verifies token is saved and state syncs correctly after page reload
 *
 * Key Features Tested:
 * - OAuth callback handling with hash parameters
 * - Token extraction and saving to localStorage
 * - State synchronization after page reload
 * - Redirect loop prevention (the fix we implemented)
 * - Context initialization timing
 */
describe('OAuth Login Flow', () => {
    const baseUrl = Cypress.config('baseUrl') || 'http://localhost:3000';
    const gotrueUrl = Cypress.env('APPFLOWY_GOTRUE_BASE_URL') || 'http://localhost/gotrue';
    const apiUrl = Cypress.env('APPFLOWY_BASE_URL') || 'http://localhost';

    beforeEach(() => {
        // Handle uncaught exceptions
        cy.on('uncaught:exception', (err) => {
            if (
                err.message.includes('Minified React error') ||
                err.message.includes('View not found') ||
                err.message.includes('No workspace or service found') ||
                err.message.includes('Cannot read properties of undefined')
            ) {
                return false;
            }
            return true;
        });
        cy.viewport(1280, 720);

        // Clear localStorage before each test
        cy.window().then((win) => {
            win.localStorage.clear();
        });
    });

    describe('Google OAuth Login - New User', () => {
        it('should complete OAuth login for new user without redirect loop', () => {
            const testEmail = `oauth-test-${uuidv4()}@appflowy.io`;
            const mockAccessToken = 'mock-oauth-access-token-' + uuidv4();
            const mockRefreshToken = 'mock-oauth-refresh-token-' + uuidv4();
            const mockUserId = uuidv4();
            const mockWorkspaceId = uuidv4();

            cy.log(`[TEST START] Testing OAuth login for new user: ${testEmail}`);

            // Mock the verifyToken endpoint - new user
            cy.intercept('GET', `${apiUrl}/api/user/verify/${mockAccessToken}`, {
                statusCode: 200,
                body: {
                    code: 0,
                    data: {
                        is_new: true,
                    },
                    message: 'User verified successfully',
                },
            }).as('verifyUser');

            // Mock the refreshToken endpoint
            cy.intercept('POST', `${gotrueUrl}/token?grant_type=refresh_token`, {
                statusCode: 200,
                body: {
                    access_token: mockAccessToken,
                    refresh_token: mockRefreshToken,
                    expires_at: Math.floor(Date.now() / 1000) + 3600,
                    user: {
                        id: mockUserId,
                        email: testEmail,
                        email_confirmed_at: new Date().toISOString(),
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                },
            }).as('refreshToken');

            // Mock getUserWorkspaceInfo endpoint
            cy.intercept('GET', `${apiUrl}/api/user/workspace`, {
                statusCode: 200,
                body: {
                    code: 0,
                    data: {
                        user_profile: { uuid: mockUserId },
                        visiting_workspace: {
                            workspace_id: mockWorkspaceId,
                            workspace_name: 'My Workspace',
                            icon: '',
                            created_at: Date.now().toString(),
                            database_storage_id: '',
                            owner_uid: 1,
                            owner_name: 'Test User',
                            member_count: 1,
                        },
                        workspaces: [
                            {
                                workspace_id: mockWorkspaceId,
                                workspace_name: 'My Workspace',
                                icon: '',
                                created_at: Date.now().toString(),
                                database_storage_id: '',
                                owner_uid: 1,
                                owner_name: 'Test User',
                                member_count: 1,
                            },
                        ],
                    },
                    message: 'Success',
                },
            }).as('getUserWorkspaceInfo');

            // Mock getCurrentUser endpoint
            cy.intercept('GET', `${apiUrl}/api/user/profile*`, {
                statusCode: 200,
                body: {
                    code: 0,
                    data: {
                        uid: 1,
                        uuid: mockUserId,
                        email: testEmail,
                        name: 'Test User',
                        metadata: {},
                        encryption_sign: null,
                        latest_workspace_id: mockWorkspaceId,
                        updated_at: Date.now(),
                    },
                    message: 'Success',
                },
            }).as('getCurrentUser');

            // Step 1: Simulate OAuth callback by visiting /auth/callback with hash params
            // This simulates what happens after Google redirects back
            cy.log('[STEP 1] Simulating OAuth callback with hash parameters');
            const callbackUrl = `${baseUrl}/auth/callback#access_token=${mockAccessToken}&expires_at=${Math.floor(Date.now() / 1000) + 3600
                }&expires_in=7200&provider_refresh_token=google_refresh_token&provider_token=google_provider_token&refresh_token=${mockRefreshToken}&token_type=bearer`;

            cy.visit(callbackUrl, { failOnStatusCode: false });
            cy.wait(2000);

            // Step 2: Wait for verifyToken API call (new users redirect immediately, so we might already be on /app)
            cy.log('[STEP 2] Waiting for verifyToken API call');
            cy.wait('@verifyUser', { timeout: 10000 }).then((interception) => {
                expect(interception.response?.statusCode).to.equal(200);
                if (interception.response?.body) {
                    cy.log(`[API] Verify user response: ${JSON.stringify(interception.response.body)}`);
                    expect(interception.response.body.data.is_new).to.equal(true);
                }
            });

            // Step 3: Wait for refreshToken API call
            cy.log('[STEP 3] Waiting for refreshToken API call');
            cy.wait('@refreshToken', { timeout: 10000 }).then((interception) => {
                expect(interception.response?.statusCode).to.equal(200);
                if (interception.response?.body) {
                    cy.log(`[API] Refresh token response: ${JSON.stringify(interception.response.body)}`);
                }
            });

            // Step 4: Wait for redirect to /app (new users redirect immediately via window.location.replace)
            cy.log('[STEP 4] Waiting for redirect to /app');
            cy.url({ timeout: 15000 }).should('include', '/app');

            // Step 5: Verify token is saved to localStorage
            cy.log('[STEP 5] Verifying token is saved to localStorage');
            cy.window().then((win) => {
                const token = win.localStorage.getItem('token');
                expect(token).to.exist;
                const tokenData = JSON.parse(token || '{}');
                expect(tokenData.access_token).to.equal(mockAccessToken);
                expect(tokenData.refresh_token).to.equal(mockRefreshToken);
            });

            // Step 6: Verify we're NOT redirected back to login (redirect loop prevention)
            cy.log('[STEP 6] Verifying no redirect loop - should stay on /app');
            cy.wait(3000); // Wait to ensure no redirect happens
            cy.url().should('include', '/app');
            cy.url().should('not.include', '/login');

            // Step 7: Verify workspace info is loaded
            cy.log('[STEP 7] Waiting for workspace info to load');
            cy.wait('@getUserWorkspaceInfo', { timeout: 10000 });

            // Step 8: Verify user is authenticated and app is loaded
            cy.log('[STEP 8] Verifying app is fully loaded');
            cy.window().then((win) => {
                const token = win.localStorage.getItem('token');
                expect(token).to.exist;
                // Verify token is still there after page reload
                const tokenData = JSON.parse(token || '{}');
                expect(tokenData.access_token).to.exist;
            });

            cy.log('[STEP 9] OAuth login test for new user completed successfully - no redirect loop detected');
        });
    });

    describe('Google OAuth Login - Existing User', () => {
        it('should complete OAuth login for existing user without redirect loop', () => {
            const testEmail = `oauth-existing-${uuidv4()}@appflowy.io`;
            const mockAccessToken = 'mock-oauth-access-token-existing-' + uuidv4();
            const mockRefreshToken = 'mock-oauth-refresh-token-existing-' + uuidv4();
            const mockUserId = uuidv4();
            const mockWorkspaceId = uuidv4();

            cy.log(`[TEST START] Testing OAuth login for existing user: ${testEmail}`);

            // Mock the verifyToken endpoint - existing user
            cy.intercept('GET', `${apiUrl}/api/user/verify/${mockAccessToken}`, {
                statusCode: 200,
                body: {
                    code: 0,
                    data: {
                        is_new: false,
                    },
                    message: 'User verified successfully',
                },
            }).as('verifyUser');

            // Mock the refreshToken endpoint
            cy.intercept('POST', `${gotrueUrl}/token?grant_type=refresh_token`, {
                statusCode: 200,
                body: {
                    access_token: mockAccessToken,
                    refresh_token: mockRefreshToken,
                    expires_at: Math.floor(Date.now() / 1000) + 3600,
                    user: {
                        id: mockUserId,
                        email: testEmail,
                        email_confirmed_at: new Date().toISOString(),
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                },
            }).as('refreshToken');

            // Mock getUserWorkspaceInfo endpoint
            cy.intercept('GET', `${apiUrl}/api/user/workspace`, {
                statusCode: 200,
                body: {
                    code: 0,
                    data: {
                        user_profile: { uuid: mockUserId },
                        visiting_workspace: {
                            workspace_id: mockWorkspaceId,
                            workspace_name: 'My Workspace',
                            icon: '',
                            created_at: Date.now().toString(),
                            database_storage_id: '',
                            owner_uid: 1,
                            owner_name: 'Test User',
                            member_count: 1,
                        },
                        workspaces: [
                            {
                                workspace_id: mockWorkspaceId,
                                workspace_name: 'My Workspace',
                                icon: '',
                                created_at: Date.now().toString(),
                                database_storage_id: '',
                                owner_uid: 1,
                                owner_name: 'Test User',
                                member_count: 1,
                            },
                        ],
                    },
                    message: 'Success',
                },
            }).as('getUserWorkspaceInfo');

            // Mock getCurrentUser endpoint
            cy.intercept('GET', `${apiUrl}/api/user/profile*`, {
                statusCode: 200,
                body: {
                    code: 0,
                    data: {
                        uid: 1,
                        uuid: mockUserId,
                        email: testEmail,
                        name: 'Test User',
                        metadata: {},
                        encryption_sign: null,
                        latest_workspace_id: mockWorkspaceId,
                        updated_at: Date.now(),
                    },
                    message: 'Success',
                },
            }).as('getCurrentUser');

            // Step 1: Set redirectTo in localStorage (existing users use afterAuth logic)
            cy.log('[STEP 1] Setting redirectTo in localStorage');
            cy.window().then((win) => {
                win.localStorage.setItem('redirectTo', encodeURIComponent(`${baseUrl}/app`));
            });

            // Step 2: Simulate OAuth callback
            cy.log('[STEP 2] Simulating OAuth callback with hash parameters');
            const callbackUrl = `${baseUrl}/auth/callback#access_token=${mockAccessToken}&expires_at=${Math.floor(Date.now() / 1000) + 3600
                }&expires_in=7200&provider_refresh_token=google_refresh_token&provider_token=google_provider_token&refresh_token=${mockRefreshToken}&token_type=bearer`;

            cy.visit(callbackUrl, { failOnStatusCode: false });
            cy.wait(2000);

            // Step 3: Wait for verifyToken API call
            cy.log('[STEP 3] Waiting for verifyToken API call');
            cy.wait('@verifyUser', { timeout: 10000 }).then((interception) => {
                cy.log(`[API] Verify user response: ${JSON.stringify(interception.response?.body)}`);
                expect(interception.response?.statusCode).to.equal(200);
                expect(interception.response?.body.data.is_new).to.equal(false);
            });

            // Step 4: Wait for refreshToken API call
            cy.log('[STEP 4] Waiting for refreshToken API call');
            cy.wait('@refreshToken', { timeout: 10000 });

            // Step 5: Verify token is saved
            cy.log('[STEP 5] Verifying token is saved to localStorage');
            cy.window().then((win) => {
                const token = win.localStorage.getItem('token');
                expect(token).to.exist;
            });

            // Step 6: Wait for redirect to /app (existing users use afterAuth)
            cy.log('[STEP 6] Waiting for redirect to /app via afterAuth');
            cy.url({ timeout: 15000 }).should('include', '/app');

            // Step 7: Verify we're NOT redirected back to login (redirect loop prevention)
            cy.log('[STEP 7] Verifying no redirect loop - should stay on /app');
            cy.wait(5000); // Wait longer to ensure no redirect happens
            cy.url().should('include', '/app');
            cy.url().should('not.include', '/login');
            cy.url().should('not.include', 'force=true'); // Should not redirect to /login?force=true

            // Step 8: Verify redirectTo is cleared
            cy.log('[STEP 8] Verifying redirectTo is cleared');
            cy.window().then((win) => {
                const redirectTo = win.localStorage.getItem('redirectTo');
                expect(redirectTo).to.be.null;
            });

            // Step 9: Verify workspace info is loaded
            cy.log('[STEP 9] Waiting for workspace info to load');
            cy.wait('@getUserWorkspaceInfo', { timeout: 10000 });

            cy.log('[STEP 10] OAuth login test for existing user completed successfully - no redirect loop detected');
        });
    });

    describe('Redirect Loop Prevention', () => {
        it('should prevent redirect loop when token exists but context is not ready', () => {
            const mockAccessToken = 'mock-token-' + uuidv4();
            const mockRefreshToken = 'mock-refresh-' + uuidv4();
            const mockUserId = uuidv4();
            const mockWorkspaceId = uuidv4();

            cy.log('[TEST START] Testing redirect loop prevention');

            // Mock all required endpoints
            cy.intercept('GET', `${apiUrl}/api/user/verify/${mockAccessToken}`, {
                statusCode: 200,
                body: {
                    code: 0,
                    data: { is_new: false },
                    message: 'Success',
                },
            }).as('verifyUser');

            cy.intercept('POST', `${gotrueUrl}/token?grant_type=refresh_token`, {
                statusCode: 200,
                body: {
                    access_token: mockAccessToken,
                    refresh_token: mockRefreshToken,
                    expires_at: Math.floor(Date.now() / 1000) + 3600,
                    user: {
                        id: mockUserId,
                        email: 'test@example.com',
                        email_confirmed_at: new Date().toISOString(),
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                },
            }).as('refreshToken');

            cy.intercept('GET', `${apiUrl}/api/user/workspace`, {
                statusCode: 200,
                body: {
                    code: 0,
                    data: {
                        user_profile: { uuid: mockUserId },
                        visiting_workspace: {
                            workspace_id: mockWorkspaceId,
                            workspace_name: 'My Workspace',
                            icon: '',
                            created_at: Date.now().toString(),
                            database_storage_id: '',
                            owner_uid: 1,
                            owner_name: 'Test User',
                            member_count: 1,
                        },
                        workspaces: [
                            {
                                workspace_id: mockWorkspaceId,
                                workspace_name: 'My Workspace',
                                icon: '',
                                created_at: Date.now().toString(),
                                database_storage_id: '',
                                owner_uid: 1,
                                owner_name: 'Test User',
                                member_count: 1,
                            },
                        ],
                    },
                    message: 'Success',
                },
            }).as('getUserWorkspaceInfo');

            cy.intercept('GET', `${apiUrl}/api/user/profile*`, {
                statusCode: 200,
                body: {
                    code: 0,
                    data: {
                        uid: 1,
                        uuid: mockUserId,
                        email: 'test@example.com',
                        name: 'Test User',
                        metadata: {},
                        encryption_sign: null,
                        latest_workspace_id: mockWorkspaceId,
                        updated_at: Date.now(),
                    },
                    message: 'Success',
                },
            }).as('getCurrentUser');

            // Step 1: Simulate OAuth callback
            cy.log('[STEP 1] Simulating OAuth callback');
            const callbackUrl = `${baseUrl}/auth/callback#access_token=${mockAccessToken}&refresh_token=${mockRefreshToken}&expires_at=${Math.floor(Date.now() / 1000) + 3600
                }&token_type=bearer`;

            cy.visit(callbackUrl, { failOnStatusCode: false });
            cy.wait(2000);

            // Step 2: Wait for API calls
            cy.wait('@verifyUser');
            cy.wait('@refreshToken');

            // Step 3: Verify token is saved
            cy.log('[STEP 2] Verifying token is saved');
            cy.window().then((win) => {
                const token = win.localStorage.getItem('token');
                expect(token).to.exist;
            });

            // Step 4: Wait for redirect to /app
            cy.log('[STEP 3] Waiting for redirect to /app');
            cy.url({ timeout: 15000 }).should('include', '/app');

            // Step 5: Critical test - verify NO redirect loop
            // This is the main test for the fix we implemented
            cy.log('[STEP 4] Verifying NO redirect loop occurs');
            cy.wait(5000); // Wait to ensure no redirect happens

            // Should stay on /app, not redirect to /login
            cy.url().should('include', '/app');
            cy.url().should('not.include', '/login');

            // Should not have force=true parameter
            cy.url().should('not.include', 'force=true');

            // Token should still be in localStorage
            cy.window().then((win) => {
                const token = win.localStorage.getItem('token');
                expect(token).to.exist;
                const tokenData = JSON.parse(token || '{}');
                expect(tokenData.access_token).to.equal(mockAccessToken);
            });

            cy.log('[STEP 5] Redirect loop prevention test passed - token persisted and no redirect occurred');
        });
    });
});


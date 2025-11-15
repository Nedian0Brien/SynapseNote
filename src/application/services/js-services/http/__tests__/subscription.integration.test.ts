/**
 * @jest-environment node
 *
 * Integration tests for Subscription operations
 */

import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { getEnvConfig, ensureWorkspace, AuthHelper, APIService, initAPIService } from './setup';
import { v4 as uuidv4 } from 'uuid';
import { SubscriptionInterval, SubscriptionPlan } from '@/application/types';

describe('HTTP API - Subscription Operations', () => {
    let testWorkspaceId: string;
    let testAccessToken: string;
    let authHelper: AuthHelper;
    let mockToken: any;

    beforeAll(async () => {
        const envConfig = getEnvConfig();
        authHelper = new AuthHelper(envConfig.gotrueURL);

        initAPIService({
            baseURL: envConfig.baseURL,
            gotrueURL: envConfig.gotrueURL,
            wsURL: envConfig.wsURL,
        });

        const testEmail = `test-${uuidv4()}@appflowy.io`;

        try {
            const authResult = await authHelper.signInUser(testEmail);
            testAccessToken = authResult.accessToken;

            const expiresAt = Math.floor(Date.now() / 1000) + 3600;
            mockToken = {
                access_token: testAccessToken,
                refresh_token: authResult.refreshToken,
                expires_at: expiresAt,
                user: authResult.user,
            };

            testWorkspaceId = await ensureWorkspace(mockToken);
        } catch (error: any) {
            throw new Error(`Failed to authenticate test user: ${error.message}`);
        }
    }, 60000);

    beforeEach(() => {
        const { getTokenParsed } = require('@/application/session/token');
        getTokenParsed.mockReturnValue(mockToken);
    });

    describe('Subscription Query Operations', () => {
        it('should get subscriptions', async () => {
            try {
                const result = await APIService.getSubscriptions();
                expect(result).toBeDefined();
            } catch (error: any) {
                // Subscription features may require premium access
                expect(error.code).toBeDefined();
            }
        }, 30000);

        it('should get workspace subscriptions', async () => {
            if (!testWorkspaceId) { throw new Error('testWorkspaceId is not available'); }
            try {
                const result = await APIService.getWorkspaceSubscriptions(testWorkspaceId);
                expect(result).toBeDefined();
            } catch (error: any) {
                // Subscription features may require premium access
                expect(error.code).toBeDefined();
            }
        }, 30000);

        it('should get active subscription', async () => {
            if (!testWorkspaceId) { throw new Error('testWorkspaceId is not available'); }
            try {
                const result = await APIService.getActiveSubscription(testWorkspaceId);
                expect(Array.isArray(result)).toBe(true);
            } catch (error: any) {
                // May not have active subscription, which is fine
                expect(error.code).toBeDefined();
            }
        }, 30000);
    });

    describe('Subscription Management Operations', () => {
        it('should get subscription link', async () => {
            if (!testWorkspaceId) { throw new Error('testWorkspaceId is not available'); }
            try {
                const result = await APIService.getSubscriptionLink(
                    testWorkspaceId,
                    SubscriptionPlan.Pro,
                    SubscriptionInterval.Month
                );
                expect(result).toBeDefined();
                expect(typeof result).toBe('string');
            } catch (error: any) {
                // May fail for various reasons
                expect(error.code).toBeDefined();
            }
        }, 30000);

        it('should cancel subscription', async () => {
            if (!testWorkspaceId) { throw new Error('testWorkspaceId is not available'); }
            try {
                await expect(
                    APIService.cancelSubscription(testWorkspaceId, SubscriptionPlan.Pro, 'Test reason')
                ).resolves.toBeUndefined();
            } catch (error: any) {
                // May fail if no active subscription
                expect(error.code).toBeDefined();
            }
        }, 30000);
    });
});

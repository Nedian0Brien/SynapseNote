/// <reference types="cypress" />

/**
 * API utilities for Cypress tests
 * Provides reusable functions for common API operations
 */

const APPFLOWY_BASE_URL = Cypress.env('APPFLOWY_BASE_URL');

/**
 * Get access token from localStorage
 */
function getAccessToken(): Cypress.Chainable<string> {
  return cy
    .window()
    .its('localStorage')
    .invoke('getItem', 'token')
    .then(JSON.parse)
    .its('access_token');
}

/**
 * Update user metadata (including icon_url for user-level avatar)
 * @param iconUrl - The avatar URL or emoji to set
 */
export function updateUserMetadata(iconUrl: string): Cypress.Chainable<Cypress.Response<any>> {
  return getAccessToken().then((accessToken) => {
    return cy.request({
      method: 'POST',
      url: `${APPFLOWY_BASE_URL}/api/user/update`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: {
        metadata: {
          icon_url: iconUrl,
        },
      },
      failOnStatusCode: false,
    });
  });
}

/**
 * Update workspace member profile
 * @param workspaceId - The workspace ID
 * @param profileData - The profile data to update (name, avatar_url, etc.)
 */
export function updateWorkspaceMemberProfile(
  workspaceId: string,
  profileData: {
    name?: string;
    avatar_url?: string | null;
    cover_image_url?: string | null;
    custom_image_url?: string | null;
    description?: string | null;
  }
): Cypress.Chainable<Cypress.Response<any>> {
  return getAccessToken().then((accessToken) => {
    return cy.request({
      method: 'PUT',
      url: `${APPFLOWY_BASE_URL}/api/workspace/${workspaceId}/update-member-profile`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: profileData,
      failOnStatusCode: false,
    });
  });
}

/**
 * Update workspace member avatar (convenience function)
 * @param workspaceId - The workspace ID
 * @param avatarUrl - The avatar URL or emoji to set
 * @param name - Optional name to update
 */
export function updateWorkspaceMemberAvatar(
  workspaceId: string,
  avatarUrl: string,
  name: string = 'Test User'
): Cypress.Chainable<Cypress.Response<any>> {
  return updateWorkspaceMemberProfile(workspaceId, {
    name,
    avatar_url: avatarUrl,
  });
}


import { databasePrefix } from '@/application/constants';

/**
 * IndexedDB utilities for Cypress tests
 * Provides helpers to interact with Dexie database in tests
 */

export interface WorkspaceMemberProfile {
  workspace_id: string;
  user_uuid: string;
  person_id: string;
  name: string;
  email: string;
  role: number;
  avatar_url: string | null;
  cover_image_url: string | null;
  custom_image_url: string | null;
  description: string | null;
  invited: boolean;
  last_mentioned_at: number | null;
  updated_at: number;
}

/**
 * Helper class for IndexedDB operations in tests
 */
export class DBTestUtils {
  private dbName = `${databasePrefix}_cache`;

  /**
   * Open the IndexedDB database
   */
  openDB(version?: number): Cypress.Chainable<IDBDatabase> {
    return cy.window().then((win) => {
      return new Cypress.Promise<IDBDatabase>((resolve, reject) => {
        const request = win.indexedDB.open(this.dbName, version);

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    });
  }

  /**
   * Get the current database version
   */
  getDBVersion(): Cypress.Chainable<number> {
    return this.openDB().then((db) => {
      const version = db.version;

      db.close();
      return version;
    });
  }

  /**
   * Check if a table exists in the database
   */
  tableExists(tableName: string): Cypress.Chainable<boolean> {
    return this.openDB().then((db) => {
      const exists = db.objectStoreNames.contains(tableName);

      db.close();
      return exists;
    });
  }

  /**
   * Get workspace member profile from database
   */
  getWorkspaceMemberProfile(
    workspaceId: string,
    userUuid: string
  ): Cypress.Chainable<WorkspaceMemberProfile | null> {
    return this.openDB().then((db) => {
      return new Cypress.Promise<WorkspaceMemberProfile | null>((resolve, reject) => {
        const transaction = db.transaction(['workspace_member_profiles'], 'readonly');
        const store = transaction.objectStore('workspace_member_profiles');
        const request = store.get([workspaceId, userUuid]);

        request.onsuccess = () => {
          resolve(request.result || null);
        };

        request.onerror = () => {
          reject(request.error);
        };

        transaction.oncomplete = () => {
          db.close();
        };
      });
    });
  }

  /**
   * Add or update workspace member profile
   */
  putWorkspaceMemberProfile(profile: WorkspaceMemberProfile): Cypress.Chainable<void> {
    return this.openDB().then((db) => {
      return new Cypress.Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['workspace_member_profiles'], 'readwrite');
        const store = transaction.objectStore('workspace_member_profiles');
        const request = store.put(profile);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(request.error);
        };

        transaction.oncomplete = () => {
          db.close();
        };
      });
    });
  }

  /**
   * Clear all data from workspace_member_profiles table
   */
  clearWorkspaceMemberProfiles(): Cypress.Chainable<void> {
    return this.openDB().then((db) => {
      return new Cypress.Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['workspace_member_profiles'], 'readwrite');
        const store = transaction.objectStore('workspace_member_profiles');
        const request = store.clear();

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(request.error);
        };

        transaction.oncomplete = () => {
          db.close();
        };
      });
    });
  }

  /**
   * Verify database schema version and tables
   */
  verifySchema(expectedVersion: number, expectedTables: string[]): Cypress.Chainable<boolean> {
    return this.openDB().then((db) => {
      const versionMatch = db.version === expectedVersion;
      const tablesMatch = expectedTables.every((table) => db.objectStoreNames.contains(table));

      db.close();
      return versionMatch && tablesMatch;
    });
  }

  /**
   * Get current user UUID from database using user ID from token
   */
  getCurrentUserUuid(): Cypress.Chainable<string | null> {
    return cy.window().then((win) => {
      const tokenStr = win.localStorage.getItem('token');
      if (!tokenStr) return null;

      const token = JSON.parse(tokenStr);
      const userUuid = token?.user?.id;
      if (!userUuid) return null;

      return this.openDB().then((db) => {
        return new Cypress.Promise<string | null>((resolve, reject) => {
          const transaction = db.transaction(['users'], 'readonly');
          const store = transaction.objectStore('users');
          const request = store.get(userUuid);

          request.onsuccess = () => {
            const user = request.result;
            resolve(user?.uuid || null);
          };

          request.onerror = () => {
            reject(request.error);
          };

          transaction.oncomplete = () => {
            db.close();
          };
        });
      });
    });
  }

  /**
   * Get workspace ID from current URL
   */
  getCurrentWorkspaceId(): Cypress.Chainable<string | null> {
    return cy.window().then((win) => {
      const urlMatch = win.location.pathname.match(/\/app\/([^/]+)/);
      return urlMatch ? urlMatch[1] : null;
    });
  }

  /**
   * Delete the entire database (for cleanup)
   */
  deleteDB(): Cypress.Chainable<void> {
    return cy.window().then((win) => {
      return new Cypress.Promise<void>((resolve, reject) => {
        const request = win.indexedDB.deleteDatabase(this.dbName);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    });
  }
}

// Export singleton instance
export const dbUtils = new DBTestUtils();

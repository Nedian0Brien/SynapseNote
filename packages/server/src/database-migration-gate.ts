/** In-process write freeze held by a durable v1→v2 migration task. */

export interface DatabaseMigrationGateOwner {
  taskId: string;
}

export class DatabaseMigrationGate {
  #owner: DatabaseMigrationGateOwner | null = null;

  tryAcquire(taskId: string): boolean {
    if (!taskId || this.#owner !== null) return this.#owner?.taskId === taskId;
    this.#owner = { taskId };
    return true;
  }

  release(taskId: string): void {
    if (this.#owner?.taskId === taskId) this.#owner = null;
  }

  /** Restore ownership from a durable journal during server bootstrap. */
  restore(taskId: string): boolean {
    if (!taskId) return false;
    if (this.#owner === null) {
      this.#owner = { taskId };
      return true;
    }
    return this.#owner.taskId === taskId;
  }

  current(): DatabaseMigrationGateOwner | null {
    return this.#owner ? { ...this.#owner } : null;
  }
}

export function createDatabaseMigrationGate(): DatabaseMigrationGate {
  return new DatabaseMigrationGate();
}

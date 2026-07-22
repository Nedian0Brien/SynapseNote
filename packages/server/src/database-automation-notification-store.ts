import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { atomicWriteFile, withFileLock } from '@nedian0brien/synapsenote-core/server';
import { z } from 'zod';

const MAX_NOTIFICATIONS = 5_000;

export const DatabaseAutomationNotificationSchema = z
  .object({
    version: z.literal(1),
    id: z.string().startsWith('autonote_'),
    recipientIds: z.array(z.string().startsWith('person_')).min(1).max(100),
    title: z.string().min(1).max(200),
    body: z.string().max(10_000),
    createdAt: z.string().datetime(),
    idempotencyKeyHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    readAt: z.string().datetime().nullable(),
  })
  .strict();

export type DatabaseAutomationNotification = z.infer<typeof DatabaseAutomationNotificationSchema>;

const StateSchema = z
  .object({
    version: z.literal(1),
    notifications: z.array(DatabaseAutomationNotificationSchema).max(MAX_NOTIFICATIONS),
  })
  .strict();

function hash(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export class DatabaseAutomationNotificationStore {
  readonly #path: string;
  readonly #lockPath: string;
  readonly #now: () => Date;
  readonly #generateUuid: () => string;

  constructor(options: { projectDir: string; now?: () => Date; generateUuid?: () => string }) {
    this.#path = resolve(
      options.projectDir,
      '.ok',
      'local',
      'database-automation-notifications.json',
    );
    this.#lockPath = resolve(
      options.projectDir,
      '.ok',
      'local',
      '.database-automation-notifications.lock',
    );
    this.#now = options.now ?? (() => new Date());
    this.#generateUuid = options.generateUuid ?? randomUUID;
  }

  async deliver(input: {
    recipientIds: readonly string[];
    title: string;
    body: string;
    idempotencyKey: string;
  }): Promise<{ receiptId: string }> {
    await mkdir(dirname(this.#lockPath), { recursive: true });
    return withFileLock(this.#lockPath, async () => {
      const state = await this.#read();
      const idempotencyKeyHash = hash(input.idempotencyKey);
      const existing = state.notifications.find(
        (notification) => notification.idempotencyKeyHash === idempotencyKeyHash,
      );
      if (existing) {
        if (
          JSON.stringify(existing.recipientIds) !== JSON.stringify(input.recipientIds) ||
          existing.title !== input.title ||
          existing.body !== input.body
        ) {
          throw new Error('Automation notification idempotency key was reused with new content');
        }
        return { receiptId: existing.id };
      }
      const notification = DatabaseAutomationNotificationSchema.parse({
        version: 1,
        id: `autonote_${this.#generateUuid().replaceAll('-', '')}`,
        recipientIds: [...input.recipientIds],
        title: input.title,
        body: input.body,
        createdAt: this.#now().toISOString(),
        idempotencyKeyHash,
        readAt: null,
      });
      state.notifications = [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS);
      await this.#write(state);
      return { receiptId: notification.id };
    });
  }

  async list(input: { recipientId?: string; unreadOnly?: boolean; limit?: number } = {}) {
    const state = await this.#read();
    return state.notifications
      .filter(
        (notification) =>
          (input.recipientId === undefined ||
            notification.recipientIds.includes(input.recipientId)) &&
          (input.unreadOnly !== true || notification.readAt === null),
      )
      .slice(0, Math.max(1, Math.min(input.limit ?? 100, 500)))
      .map((notification) => structuredClone(notification));
  }

  async markRead(id: string, readAt = this.#now().toISOString()): Promise<void> {
    await mkdir(dirname(this.#lockPath), { recursive: true });
    await withFileLock(this.#lockPath, async () => {
      const state = await this.#read();
      const notification = state.notifications.find((candidate) => candidate.id === id);
      if (!notification) throw new Error(`Automation notification "${id}" was not found`);
      notification.readAt = readAt;
      await this.#write(state);
    });
  }

  async #read(): Promise<z.infer<typeof StateSchema>> {
    try {
      return StateSchema.parse(JSON.parse(await readFile(this.#path, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: 1, notifications: [] };
      }
      throw error;
    }
  }

  async #write(state: z.infer<typeof StateSchema>): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
    await atomicWriteFile(this.#path, `${JSON.stringify(StateSchema.parse(state), null, 2)}\n`);
  }
}

export function createDatabaseAutomationNotificationStore(options: {
  projectDir: string;
  now?: () => Date;
  generateUuid?: () => string;
}) {
  return new DatabaseAutomationNotificationStore(options);
}

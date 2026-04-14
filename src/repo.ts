/**
 * Integrations module — リポジトリヘルパー
 */

import { and, desc, eq } from "drizzle-orm";
import {
  integrationSettings,
  syncLogs,
  personalEvents,
  type IntegrationSetting,
  type NewIntegrationSetting,
  type SyncLog,
  type NewSyncLog,
  type PersonalEvent,
} from "./tables.js";

export type { IntegrationSetting, SyncLog, PersonalEvent };

interface DbLike {
  select: (...args: unknown[]) => {
    from: (t: unknown) => {
      where?: (cond: unknown) => Promise<unknown[]>;
    } & Promise<unknown[]>;
  };
  insert: (t: unknown) => { values: (v: unknown) => Promise<unknown> };
  update: (t: unknown) => {
    set: (v: unknown) => { where: (cond: unknown) => Promise<unknown> };
  };
  delete: (t: unknown) => { where: (cond: unknown) => Promise<unknown> };
}

export function makeRepo(dbRaw: unknown) {
  const db = dbRaw as DbLike;

  const selectWhere = <T>(table: unknown, cond: unknown) =>
    (db.select() as unknown as {
      from: (t: unknown) => { where: (cond: unknown) => Promise<T[]> };
    }).from(table).where(cond);

  return {
    settings: {
      async findByUserAndService(
        userId: string,
        service: string,
      ): Promise<IntegrationSetting | undefined> {
        const rows = (await selectWhere<IntegrationSetting>(
          integrationSettings,
          and(eq(integrationSettings.userId, userId), eq(integrationSettings.service, service)),
        )) as IntegrationSetting[];
        return rows[0];
      },
      async upsert(data: NewIntegrationSetting): Promise<void> {
        const existing = await this.findByUserAndService(data.userId, data.service);
        if (existing) {
          await db
            .update(integrationSettings)
            .set({
              config: data.config as Record<string, unknown>,
              isActive: data.isActive,
              updatedAt: new Date(),
            })
            .where(eq(integrationSettings.id, existing.id));
        } else {
          await db.insert(integrationSettings).values(data);
        }
      },
      async update(id: string, updates: Record<string, unknown>): Promise<void> {
        await db
          .update(integrationSettings)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(integrationSettings.id, id));
      },
      async deleteById(id: string): Promise<void> {
        await db.delete(integrationSettings).where(eq(integrationSettings.id, id));
      },
    },
    syncLogs: {
      async findByUserAndService(userId: string, service: string): Promise<SyncLog[]> {
        return (await selectWhere<SyncLog>(
          syncLogs,
          and(eq(syncLogs.userId, userId), eq(syncLogs.service, service)),
        )) as SyncLog[];
      },
      async create(data: NewSyncLog): Promise<void> {
        await db.insert(syncLogs).values(data);
      },
    },
    personalEvents: {
      async findByUserId(userId: string): Promise<PersonalEvent[]> {
        return (await selectWhere<PersonalEvent>(
          personalEvents,
          eq(personalEvents.userId, userId),
        )) as PersonalEvent[];
      },
      async findByIdAndUserId(id: string, userId: string): Promise<PersonalEvent | undefined> {
        const rows = (await selectWhere<PersonalEvent>(
          personalEvents,
          and(eq(personalEvents.id, id), eq(personalEvents.userId, userId)),
        )) as PersonalEvent[];
        return rows[0];
      },
      async update(id: string, updates: Record<string, unknown>): Promise<void> {
        await db
          .update(personalEvents)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(personalEvents.id, id));
      },
    },
  };
}

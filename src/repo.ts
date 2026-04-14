/**
 * Holiday module — リポジトリヘルパー
 */

import { and, eq, isNull, or, gte, lte } from "drizzle-orm";
import { holidays, groupMembers } from "./tables.js";
import type { Holiday, NewHoliday } from "./tables.js";

export type { Holiday };

interface DbLike {
  select: (...args: unknown[]) => {
    from: (t: unknown) => {
      where?: (cond: unknown) => Promise<unknown[]>;
    } & Promise<unknown[]>;
  };
  insert: (t: unknown) => { values: (v: unknown) => Promise<unknown> };
  delete: (t: unknown) => { where: (cond: unknown) => Promise<unknown> };
}

export function makeRepo(dbRaw: unknown) {
  const db = dbRaw as DbLike;

  return {
    holidays: {
      async findAll(): Promise<Holiday[]> {
        return (await db.select().from(holidays)) as Holiday[];
      },
      async findById(id: string): Promise<Holiday | undefined> {
        const rows = (await (db.select() as unknown as {
          from: (t: unknown) => { where: (cond: unknown) => Promise<Holiday[]> };
        }).from(holidays).where(eq(holidays.id, id))) as Holiday[];
        return rows[0];
      },
      async findForGroup(groupId: string): Promise<Holiday[]> {
        return (await (db.select() as unknown as {
          from: (t: unknown) => { where: (cond: unknown) => Promise<Holiday[]> };
        }).from(holidays).where(
          or(eq(holidays.groupId, groupId), isNull(holidays.groupId)),
        )) as Holiday[];
      },
      async findByDateRange(startDate: string, endDate: string, groupId?: string): Promise<Holiday[]> {
        const cond = groupId
          ? and(
              gte(holidays.date, startDate),
              lte(holidays.date, endDate),
              or(eq(holidays.groupId, groupId), isNull(holidays.groupId)),
            )
          : and(
              gte(holidays.date, startDate),
              lte(holidays.date, endDate),
              isNull(holidays.groupId),
            );
        return (await (db.select() as unknown as {
          from: (t: unknown) => { where: (cond: unknown) => Promise<Holiday[]> };
        }).from(holidays).where(cond)) as Holiday[];
      },
      async create(data: NewHoliday): Promise<void> {
        await db.insert(holidays).values(data);
      },
      async deleteById(id: string): Promise<void> {
        await db.delete(holidays).where(eq(holidays.id, id));
      },
      async deleteBySource(source: string, groupId?: string): Promise<void> {
        const cond = groupId
          ? and(eq(holidays.source, source), eq(holidays.groupId, groupId))
          : and(eq(holidays.source, source), isNull(holidays.groupId));
        await db.delete(holidays).where(cond);
      },
    },
    members: {
      async findByGroupAndUser(groupId: string, userId: string) {
        const rows = (await (db.select() as unknown as {
          from: (t: unknown) => { where: (cond: unknown) => Promise<unknown[]> };
        }).from(groupMembers).where(
          and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
        )) as Array<{ id: string; role: string }>;
        return rows[0];
      },
    },
  };
}

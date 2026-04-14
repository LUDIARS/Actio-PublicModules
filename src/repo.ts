/**
 * Smart-scheduler module — リポジトリヘルパー
 */

import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import {
  schedulingTasks,
  schedulingResults,
  groupMembers,
  personalEvents,
  groupSchedules,
  instructorAvailableSlots,
  holidays,
  groupEvents,
  type SchedulingTask,
  type NewSchedulingTask,
  type SchedulingResult,
  type NewSchedulingResult,
} from "./tables.js";

export type { SchedulingTask, SchedulingResult };

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

  const selectFrom = <T>(table: unknown) =>
    (db.select() as unknown as {
      from: (t: unknown) => {
        where: (cond: unknown) => Promise<T[]>;
      } & Promise<T[]>;
    }).from(table);

  return {
    tasks: {
      async findByGroupId(groupId: string): Promise<SchedulingTask[]> {
        return (await selectFrom<SchedulingTask>(schedulingTasks).where(
          eq(schedulingTasks.groupId, groupId),
        )) as SchedulingTask[];
      },
      async findPendingByGroupId(groupId: string): Promise<SchedulingTask[]> {
        return (await selectFrom<SchedulingTask>(schedulingTasks).where(
          and(eq(schedulingTasks.groupId, groupId), eq(schedulingTasks.status, "pending")),
        )) as SchedulingTask[];
      },
      async findById(id: string): Promise<SchedulingTask | undefined> {
        const rows = (await selectFrom<SchedulingTask>(schedulingTasks).where(
          eq(schedulingTasks.id, id),
        )) as SchedulingTask[];
        return rows[0];
      },
      async create(data: NewSchedulingTask): Promise<void> {
        await db.insert(schedulingTasks).values(data);
      },
      async update(id: string, updates: Record<string, unknown>): Promise<void> {
        await db.update(schedulingTasks).set(updates).where(eq(schedulingTasks.id, id));
      },
      async deleteById(id: string): Promise<void> {
        await db.delete(schedulingTasks).where(eq(schedulingTasks.id, id));
      },
    },
    results: {
      async findByGroupId(groupId: string): Promise<SchedulingResult[]> {
        return (await selectFrom<SchedulingResult>(schedulingResults).where(
          eq(schedulingResults.groupId, groupId),
        )) as SchedulingResult[];
      },
      async findById(id: string): Promise<SchedulingResult | undefined> {
        const rows = (await selectFrom<SchedulingResult>(schedulingResults).where(
          eq(schedulingResults.id, id),
        )) as SchedulingResult[];
        return rows[0];
      },
      async create(data: NewSchedulingResult): Promise<void> {
        await db.insert(schedulingResults).values(data);
      },
      async update(id: string, updates: Record<string, unknown>): Promise<void> {
        await db.update(schedulingResults).set(updates).where(eq(schedulingResults.id, id));
      },
    },
    members: {
      async findByUserId(userId: string) {
        return (await selectFrom<{ groupId: string; userId: string; role: string }>(
          groupMembers,
        ).where(eq(groupMembers.userId, userId))) as Array<{
          groupId: string;
          userId: string;
          role: string;
        }>;
      },
      async findByGroupId(groupId: string) {
        return (await selectFrom<{ groupId: string; userId: string; role: string }>(
          groupMembers,
        ).where(eq(groupMembers.groupId, groupId))) as Array<{
          groupId: string;
          userId: string;
          role: string;
        }>;
      },
    },
    personalEvents: {
      async findByUserId(userId: string) {
        return (await selectFrom<{ day: number; period: number; duration: number }>(
          personalEvents,
        ).where(eq(personalEvents.userId, userId))) as Array<{
          day: number;
          period: number;
          duration: number;
        }>;
      },
    },
    groupSchedules: {
      async findByGroupId(groupId: string) {
        return (await selectFrom<{ day: number; period: number; duration: number }>(
          groupSchedules,
        ).where(eq(groupSchedules.groupId, groupId))) as Array<{
          day: number;
          period: number;
          duration: number;
        }>;
      },
    },
    instructorSlots: {
      async findByInstructor(instructorId: string) {
        return (await selectFrom<{ day: number; periods: number[] | string }>(
          instructorAvailableSlots,
        ).where(eq(instructorAvailableSlots.instructorId, instructorId))) as Array<{
          day: number;
          periods: number[] | string;
        }>;
      },
    },
    holidays: {
      async findByDateRange(startDate: string, endDate: string, groupId?: string) {
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
        return (await selectFrom<{ date: string; endDate: string | null }>(holidays).where(
          cond,
        )) as Array<{ date: string; endDate: string | null }>;
      },
    },
    groupEvents: {
      async findByGroupId(groupId: string) {
        return (await selectFrom<{
          eventType: string;
          date: string;
          endDate: string | null;
        }>(groupEvents).where(eq(groupEvents.groupId, groupId))) as Array<{
          eventType: string;
          date: string;
          endDate: string | null;
        }>;
      },
    },
  };
}

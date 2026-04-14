/**
 * MyPlan module — リポジトリヘルパー
 */

import { and, eq } from "drizzle-orm";
import { myPlans, personalEvents } from "./tables.js";
import type { MyPlan, NewMyPlan, PersonalEvent, NewPersonalEvent } from "./tables.js";

export type { MyPlan, PersonalEvent };

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

  return {
    plans: {
      async findByUserId(userId: string): Promise<MyPlan[]> {
        return (await (db.select() as unknown as {
          from: (t: unknown) => { where: (cond: unknown) => Promise<MyPlan[]> };
        }).from(myPlans).where(eq(myPlans.userId, userId))) as MyPlan[];
      },
      async findById(id: string): Promise<MyPlan | undefined> {
        const rows = (await (db.select() as unknown as {
          from: (t: unknown) => { where: (cond: unknown) => Promise<MyPlan[]> };
        }).from(myPlans).where(eq(myPlans.id, id))) as MyPlan[];
        return rows[0];
      },
      async findByIdAndUserId(id: string, userId: string): Promise<MyPlan | undefined> {
        const rows = (await (db.select() as unknown as {
          from: (t: unknown) => { where: (cond: unknown) => Promise<MyPlan[]> };
        }).from(myPlans).where(and(eq(myPlans.id, id), eq(myPlans.userId, userId)))) as MyPlan[];
        return rows[0];
      },
      async create(data: NewMyPlan): Promise<void> {
        await db.insert(myPlans).values(data);
      },
      async update(id: string, data: Partial<Omit<NewMyPlan, "id">>): Promise<void> {
        await db.update(myPlans).set(data).where(eq(myPlans.id, id));
      },
      async deleteById(id: string): Promise<void> {
        await db.delete(myPlans).where(eq(myPlans.id, id));
      },
    },
    events: {
      async create(data: NewPersonalEvent): Promise<void> {
        await db.insert(personalEvents).values(data);
      },
      async deleteByPlanId(planId: string): Promise<void> {
        await db.delete(personalEvents).where(eq(personalEvents.planId, planId));
      },
      async deleteByUserAndPlan(userId: string, planId: string): Promise<void> {
        await db.delete(personalEvents).where(
          and(eq(personalEvents.userId, userId), eq(personalEvents.planId, planId)),
        );
      },
      async findByUserDayPeriod(userId: string, day: number, period: number): Promise<PersonalEvent | undefined> {
        const rows = (await (db.select() as unknown as {
          from: (t: unknown) => { where: (cond: unknown) => Promise<PersonalEvent[]> };
        }).from(personalEvents).where(
          and(
            eq(personalEvents.userId, userId),
            eq(personalEvents.day, day),
            eq(personalEvents.period, period),
          ),
        )) as PersonalEvent[];
        return rows[0];
      },
    },
  };
}

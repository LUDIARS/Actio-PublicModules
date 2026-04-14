/**
 * MyPlan module — DB テーブル定義 (cross-dialect)
 */

import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const myPlans = pgTable(
  "my_plans",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    groupId: text("group_id"),
    name: text("name").notNull(),
    patternType: text("pattern_type").notNull().default("basic"),
    validFrom: text("valid_from"),
    validUntil: text("valid_until"),
    weeklySchedule: text("weekly_schedule").notNull().default("{}"),
    isActive: integer("is_active").notNull().default(1),
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
    updatedAt: timestamp("updated_at").$defaultFn(() => new Date()).notNull(),
  },
  (t) => ({
    byUser: index("idx_myplan_user").on(t.userId),
    byGroup: index("idx_myplan_group").on(t.groupId),
  }),
);

export const personalEvents = pgTable(
  "personal_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    day: integer("day").notNull(),
    period: integer("period").notNull(),
    duration: integer("duration").notNull().default(1),
    startTime: text("start_time"),
    endTime: text("end_time"),
    eventType: text("event_type").notNull().default("personal"),
    planId: text("plan_id"),
    isPrivate: integer("is_private").notNull().default(1),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
    updatedAt: timestamp("updated_at").$defaultFn(() => new Date()).notNull(),
  },
  (t) => ({
    byUser: index("idx_personal_event_user").on(t.userId),
    byPlan: index("idx_personal_event_plan").on(t.planId),
  }),
);

export type MyPlan = typeof myPlans.$inferSelect;
export type NewMyPlan = typeof myPlans.$inferInsert;
export type PersonalEvent = typeof personalEvents.$inferSelect;
export type NewPersonalEvent = typeof personalEvents.$inferInsert;

/**
 * Smart-scheduler module — DB テーブル定義
 *
 * 所有テーブル:
 *   - scheduling_tasks (配置候補タスク)
 *   - scheduling_results (配置実行結果)
 *
 * 読み取り専用の参照テーブル (ホスト所有):
 *   - groups / group_members — アクセス制御
 *   - personal_events / group_schedules — 空き状況計算
 *   - instructor_available_slots — 講師スロット制約
 *   - holidays / group_events — 休日・審査会期間 (holiday モジュール + ホスト)
 *
 * pg-core で宣言し、SQLite/Postgres 両方で動作するよう boolean は integer(0/1) で表現。
 */

import { pgTable, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

// ─── Owned tables ───────────────────────────────────────────

export const schedulingTasks = pgTable(
  "scheduling_tasks",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id").notNull(),
    title: text("title").notNull(),
    duration: integer("duration").notNull().default(1),
    priority: integer("priority").notNull().default(0),
    preferredDays: jsonb("preferred_days").$type<number[]>().notNull().default([]),
    preferredPeriods: jsonb("preferred_periods").$type<number[]>().notNull().default([]),
    instructorId: text("instructor_id"),
    status: text("status").notNull().default("pending"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
    updatedAt: timestamp("updated_at").$defaultFn(() => new Date()).notNull(),
  },
  (t) => ({
    byGroup: index("idx_sched_task_group").on(t.groupId),
    byStatus: index("idx_sched_task_status").on(t.status),
  }),
);

export const schedulingResults = pgTable(
  "scheduling_results",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id").notNull(),
    status: text("status").notNull().default("draft"),
    placements: jsonb("placements").$type<unknown[]>().notNull().default([]),
    totalScore: integer("total_score").notNull().default(0),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
  },
  (t) => ({
    byGroup: index("idx_sched_result_group").on(t.groupId),
  }),
);

// ─── Read-only shared tables (host-owned) ───────────────────

export const groupMembers = pgTable("group_members", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
});

export const personalEvents = pgTable("personal_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  day: integer("day").notNull(),
  period: integer("period").notNull(),
  duration: integer("duration").notNull().default(1),
});

export const groupSchedules = pgTable("group_schedules", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  day: integer("day").notNull(),
  period: integer("period").notNull(),
  duration: integer("duration").notNull().default(1),
});

export const instructorAvailableSlots = pgTable("instructor_available_slots", {
  id: text("id").primaryKey(),
  instructorId: text("instructor_id").notNull(),
  day: integer("day").notNull(),
  periods: jsonb("periods").$type<number[]>().notNull().default([]),
});

export const holidays = pgTable("holidays", {
  id: text("id").primaryKey(),
  groupId: text("group_id"),
  name: text("name").notNull(),
  date: text("date").notNull(),
  endDate: text("end_date"),
  holidayType: text("holiday_type").notNull().default("custom"),
  recurrence: text("recurrence").notNull().default("none"),
  source: text("source"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
});

export const groupEvents = pgTable("group_events", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  eventType: text("event_type").notNull(),
  date: text("date").notNull(),
  endDate: text("end_date"),
});

export type SchedulingTask = typeof schedulingTasks.$inferSelect;
export type NewSchedulingTask = typeof schedulingTasks.$inferInsert;
export type SchedulingResult = typeof schedulingResults.$inferSelect;
export type NewSchedulingResult = typeof schedulingResults.$inferInsert;

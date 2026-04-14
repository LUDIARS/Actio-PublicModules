/**
 * Holiday module — DB テーブル定義
 *
 * Schedula 本体の holidays / group_members テーブルと同形状を独自宣言。
 * Cross-dialect (sqlite/postgres) のため pg-core を使用 (boolean→integer 変換は不要、本テーブルに boolean なし)。
 */

import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

export const holidays = pgTable(
  "holidays",
  {
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
  },
  (t) => ({
    byDate: index("idx_holiday_date").on(t.date),
    byGroup: index("idx_holiday_group").on(t.groupId),
  }),
);

export const groupMembers = pgTable("group_members", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
});

export type Holiday = typeof holidays.$inferSelect;
export type NewHoliday = typeof holidays.$inferInsert;

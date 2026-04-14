/**
 * Integrations module — DB テーブル定義
 *
 * 所有テーブル:
 *   - integration_settings (Notion database id など、各ユーザーの連携設定)
 *   - sync_logs (同期結果ログ)
 *
 * 共有参照テーブル (host 所有):
 *   - personal_events (Schedula カレンダーイベント、googleCalendarEventId/notionPageId を更新)
 *
 * OAuth token は Cernere に保管 (ctx.oauth.store/get/delete)。
 * このテーブルでは access_token カラムを持たない (個人データ保管禁止ルール)。
 */

import { pgTable, text, integer, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";

export const integrationSettings = pgTable(
  "integration_settings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    service: text("service").notNull(),
    /** 連携固有の設定 (Notion の databaseId 等)。個人トークンは含めない。 */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    isActive: integer("is_active").notNull().default(1),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
    updatedAt: timestamp("updated_at").$defaultFn(() => new Date()).notNull(),
  },
  (t) => ({
    uniqUserSvc: unique("unique_integration_user_service").on(t.userId, t.service),
    byUser: index("idx_integration_user").on(t.userId),
  }),
);

export const syncLogs = pgTable(
  "sync_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    service: text("service").notNull(),
    action: text("action").notNull(),
    localEventId: text("local_event_id"),
    externalId: text("external_id"),
    status: text("status").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
  },
  (t) => ({
    byUser: index("idx_sync_log_user").on(t.userId),
    byUserSvc: index("idx_sync_log_user_service").on(t.userId, t.service),
  }),
);

// ─── Shared (host-owned, read/write) ─────────────────────────

export const personalEvents = pgTable("personal_events", {
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
  googleCalendarEventId: text("google_calendar_event_id"),
  notionPageId: text("notion_page_id"),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()).notNull(),
});

export type IntegrationSetting = typeof integrationSettings.$inferSelect;
export type NewIntegrationSetting = typeof integrationSettings.$inferInsert;
export type SyncLog = typeof syncLogs.$inferSelect;
export type NewSyncLog = typeof syncLogs.$inferInsert;
export type PersonalEvent = typeof personalEvents.$inferSelect;

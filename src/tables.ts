/**
 * Voting module — DB テーブル定義
 *
 * Schedula 本体のスキーマに存在するテーブル (voting_events, voting_candidates, votes)
 * と同一の形状を独自に宣言する。実体のテーブルは Schedula の migrate.ts が作成する。
 *
 * Phase 3 で Schedula からこれらのテーブル定義を本モジュール配下に移管予定。
 */

// 注: Schedula は SQLite (dev/test) / PostgreSQL (prod) をサポート。
// pg-core のテーブル定義は Drizzle の汎用的なテーブル宣言として機能するため
// SQLite でも動作する (データ型は consumer 側のスキーマで決定される)。
// boolean カラムは integer (0/1) で扱う (両方言で互換性確保)。
import { pgTable, text, timestamp, integer, unique, index } from "drizzle-orm/pg-core";

export const votingEvents = pgTable("voting_events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  createdBy: text("created_by").notNull(),
  deadline: text("deadline"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()).notNull(),
});

export const votingCandidates = pgTable(
  "voting_candidates",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    byEvent: index("idx_candidate_event").on(t.eventId),
  }),
);

export const votes = pgTable(
  "votes",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    candidateId: text("candidate_id").notNull(),
    userId: text("user_id").notNull(),
    answer: text("answer").notNull(),
    // boolean フィールドは integer (0/1) で宣言 — SQLite/PostgreSQL 双方互換
    isAutoReply: integer("is_auto_reply").notNull().default(0),
    comment: text("comment").notNull().default(""),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
    updatedAt: timestamp("updated_at").$defaultFn(() => new Date()).notNull(),
  },
  (t) => ({
    uniqVote: unique().on(t.eventId, t.candidateId, t.userId),
    byEvent: index("idx_vote_event").on(t.eventId),
    byUser: index("idx_vote_user").on(t.userId),
  }),
);

export type VotingEvent = typeof votingEvents.$inferSelect;
export type NewVotingEvent = typeof votingEvents.$inferInsert;
export type VotingCandidate = typeof votingCandidates.$inferSelect;
export type NewVotingCandidate = typeof votingCandidates.$inferInsert;
export type Vote = typeof votes.$inferSelect;
export type NewVote = typeof votes.$inferInsert;

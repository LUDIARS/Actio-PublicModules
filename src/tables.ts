/**
 * Voting module — DB テーブル定義
 *
 * Schedula 本体のスキーマに存在するテーブル (voting_events, voting_candidates, votes)
 * と同一の形状を独自に宣言する。実体のテーブルは Schedula の migrate.ts が作成する。
 *
 * Phase 3 で Schedula からこれらのテーブル定義を本モジュール配下に移管予定。
 */

import { pgTable, text, timestamp, integer, unique, index, boolean } from "drizzle-orm/pg-core";

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
    isAutoReply: boolean("is_auto_reply").notNull().default(false),
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

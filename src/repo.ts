/**
 * Voting module — リポジトリヘルパー
 *
 * ctx.db.raw (Drizzle instance) を受け取ってクエリを組み立てる。
 * Schedula の repository.ts には依存しない (モジュール自己完結のため)。
 */

import { and, eq, inArray } from "drizzle-orm";
import {
  votingEvents,
  votingCandidates,
  votes,
} from "./tables.js";
import type {
  VotingEvent,
  NewVotingEvent,
  VotingCandidate,
  NewVotingCandidate,
  Vote,
  NewVote,
} from "./tables.js";

export type { VotingEvent, VotingCandidate, Vote };

// Drizzle instance の型は consumer 側 (Schedula) が提供。
// ここでは最小限のダック型で受ける。
interface DbLike {
  select: (...args: unknown[]) => {
    from: (t: unknown) => {
      where?: (cond: unknown) => Promise<unknown[]>;
    };
  };
  insert: (t: unknown) => { values: (v: unknown) => Promise<unknown> };
  update: (t: unknown) => {
    set: (v: unknown) => { where: (cond: unknown) => Promise<unknown> };
  };
  delete: (t: unknown) => { where: (cond: unknown) => Promise<unknown> };
}

type Db = DbLike & Record<string, unknown>;

export function makeRepo(dbRaw: unknown) {
  const db = dbRaw as Db;

  return {
    events: {
      async findAll(): Promise<VotingEvent[]> {
        return (await (db.select() as unknown as { from: (t: unknown) => Promise<VotingEvent[]> }).from(votingEvents)) as VotingEvent[];
      },
      async findById(id: string): Promise<VotingEvent | undefined> {
        const rows = (await (db.select() as unknown as {
          from: (t: unknown) => {
            where: (cond: unknown) => Promise<VotingEvent[]>;
          };
        }).from(votingEvents).where(eq(votingEvents.id, id))) as VotingEvent[];
        return rows[0];
      },
      async create(data: NewVotingEvent): Promise<void> {
        await db.insert(votingEvents).values(data);
      },
      async update(id: string, data: Partial<Omit<NewVotingEvent, "id">>): Promise<void> {
        await db.update(votingEvents).set(data).where(eq(votingEvents.id, id));
      },
      async deleteById(id: string): Promise<void> {
        await db.delete(votingEvents).where(eq(votingEvents.id, id));
      },
    },

    candidates: {
      async findByEventId(eventId: string): Promise<VotingCandidate[]> {
        return (await (db.select() as unknown as {
          from: (t: unknown) => {
            where: (cond: unknown) => Promise<VotingCandidate[]>;
          };
        }).from(votingCandidates).where(eq(votingCandidates.eventId, eventId))) as VotingCandidate[];
      },
      async findByEventIds(eventIds: string[]): Promise<VotingCandidate[]> {
        if (eventIds.length === 0) return [];
        return (await (db.select() as unknown as {
          from: (t: unknown) => {
            where: (cond: unknown) => Promise<VotingCandidate[]>;
          };
        }).from(votingCandidates).where(inArray(votingCandidates.eventId, eventIds))) as VotingCandidate[];
      },
      async create(data: NewVotingCandidate): Promise<void> {
        await db.insert(votingCandidates).values(data);
      },
      async deleteByEventId(eventId: string): Promise<void> {
        await db.delete(votingCandidates).where(eq(votingCandidates.eventId, eventId));
      },
    },

    votes: {
      async findByEventId(eventId: string): Promise<Vote[]> {
        return (await (db.select() as unknown as {
          from: (t: unknown) => {
            where: (cond: unknown) => Promise<Vote[]>;
          };
        }).from(votes).where(eq(votes.eventId, eventId))) as Vote[];
      },
      async findExisting(eventId: string, candidateId: string, userId: string): Promise<Vote | undefined> {
        const rows = (await (db.select() as unknown as {
          from: (t: unknown) => {
            where: (cond: unknown) => Promise<Vote[]>;
          };
        }).from(votes).where(
          and(
            eq(votes.eventId, eventId),
            eq(votes.candidateId, candidateId),
            eq(votes.userId, userId),
          ),
        )) as Vote[];
        return rows[0];
      },
      async create(data: NewVote): Promise<void> {
        await db.insert(votes).values(data);
      },
      async update(id: string, data: Partial<Omit<NewVote, "id">>): Promise<void> {
        await db.update(votes).set(data).where(eq(votes.id, id));
      },
      async deleteByEventId(eventId: string): Promise<void> {
        await db.delete(votes).where(eq(votes.eventId, eventId));
      },
      async deleteByUserId(userId: string): Promise<void> {
        await db.delete(votes).where(eq(votes.userId, userId));
      },
    },
  };
}

export type VotingRepo = ReturnType<typeof makeRepo>;

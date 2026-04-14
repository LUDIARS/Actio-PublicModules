/**
 * Voting module — REST routes
 */

import { v4 as uuidv4 } from "uuid";
import type { Hono } from "hono";
import type { ModuleContext } from "@ludiars/schedula-sdk";
import { makeRepo, type VotingEvent, type VotingCandidate } from "./repo.js";
import { generateAutoReply } from "./auto-reply.js";

type VoteAnswer = "ok" | "maybe" | "ng";

export function registerRoutes(app: Hono, ctx: ModuleContext): void {
  const repo = makeRepo(ctx.db.raw);

  app.post("/events", async (c) => {
    const userId = c.get("userId" as never) as string | undefined;
    if (!userId) return c.json({ error: "Authentication required" }, 401);
    const body = await c.req.json<{
      title: string;
      description?: string;
      deadline?: string;
      candidates: string[];
    }>();

    if (!body.title || !body.candidates?.length) {
      return c.json({ error: "title and candidates are required" }, 400);
    }

    const eventId = uuidv4();
    await repo.events.create({
      id: eventId,
      title: body.title,
      description: body.description || "",
      createdBy: userId,
      deadline: body.deadline || null,
      status: "open",
    });

    const candidateRows = body.candidates.map((label, i) => ({
      id: uuidv4(),
      eventId,
      label,
      sortOrder: i,
    }));

    for (const row of candidateRows) {
      await repo.candidates.create(row);
    }

    const user = await ctx.users.get(userId);
    ctx.audit(userId, "投票イベント作成", `投票イベント「${body.title}」が追加されました (user: ${user.name})`);

    return c.json({ id: eventId, title: body.title, candidates: candidateRows }, 201);
  });

  app.get("/events", async (c) => {
    const events = await repo.events.findAll();
    const eventIds = events.map((e: VotingEvent) => e.id);
    const allCandidates = await repo.candidates.findByEventIds(eventIds);

    const candidatesByEvent = new Map<string, VotingCandidate[]>();
    for (const cand of allCandidates) {
      const list = candidatesByEvent.get(cand.eventId) || [];
      list.push(cand);
      candidatesByEvent.set(cand.eventId, list);
    }

    const result = events.map((e: VotingEvent) => ({
      ...e,
      candidates: candidatesByEvent.get(e.id) || [],
    }));
    return c.json({ events: result });
  });

  app.get("/events/:eventId", async (c) => {
    const eventId = c.req.param("eventId");
    const event = await repo.events.findById(eventId);
    if (!event) return c.json({ error: "Event not found" }, 404);

    const candidates = await repo.candidates.findByEventId(eventId);
    const allVotes = await repo.votes.findByEventId(eventId);

    const summary: Record<string, { ok: number; maybe: number; ng: number }> = {};
    for (const cand of candidates) {
      summary[cand.id] = { ok: 0, maybe: 0, ng: 0 };
    }

    const responses: Record<string, Record<string, unknown>> = {};
    const userIds = new Set<string>();

    for (const vote of allVotes) {
      userIds.add(vote.userId);
      if (summary[vote.candidateId]) {
        if (vote.answer === "ok") summary[vote.candidateId].ok++;
        else if (vote.answer === "maybe") summary[vote.candidateId].maybe++;
        else if (vote.answer === "ng") summary[vote.candidateId].ng++;
      }
      if (!responses[vote.userId]) responses[vote.userId] = {};
      responses[vote.userId][vote.candidateId] = vote;
    }

    const respondents: Record<string, string> = {};
    if (userIds.size > 0) {
      const infoMap = await ctx.users.getMany(Array.from(userIds));
      for (const [id, info] of infoMap) {
        respondents[id] = info.name;
      }
    }

    return c.json({
      event: { ...event, candidates },
      summary,
      responses,
      respondents,
    });
  });

  app.post("/events/:eventId/votes", async (c) => {
    const eventId = c.req.param("eventId");
    const userId = c.get("userId" as never) as string | undefined;
    if (!userId) return c.json({ error: "Authentication required" }, 401);
    const body = await c.req.json<{
      votes: { candidateId: string; answer: VoteAnswer; comment?: string }[];
    }>();

    const event = await repo.events.findById(eventId);
    if (!event) return c.json({ error: "Event not found" }, 404);
    if (event.status !== "open") return c.json({ error: "Event is closed" }, 400);

    if (event.deadline) {
      const deadline = new Date(event.deadline);
      if (new Date() > deadline) return c.json({ error: "Voting deadline has passed" }, 400);
    }

    const saved: Array<Record<string, unknown>> = [];
    for (const v of body.votes) {
      const existing = await repo.votes.findExisting(eventId, v.candidateId, userId);
      if (existing) {
        await repo.votes.update(existing.id, {
          answer: v.answer,
          comment: v.comment || "",
          isAutoReply: false,
          updatedAt: new Date(),
        });
        saved.push({ ...existing, answer: v.answer, comment: v.comment || "" });
      } else {
        const voteId = uuidv4();
        await repo.votes.create({
          id: voteId,
          eventId,
          candidateId: v.candidateId,
          userId,
          answer: v.answer,
          isAutoReply: false,
          comment: v.comment || "",
        });
        saved.push({ id: voteId, ...v, userId });
      }
    }

    const user = await ctx.users.get(userId);
    ctx.audit(userId, "投票回答", `投票イベント(${eventId})に回答しました (user: ${user.name})`);

    return c.json({ votes: saved });
  });

  app.post("/events/:eventId/auto-reply", async (c) => {
    const eventId = c.req.param("eventId");
    const userId = c.get("userId" as never) as string | undefined;
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const event = await repo.events.findById(eventId);
    if (!event) return c.json({ error: "Event not found" }, 404);
    if (event.status !== "open") return c.json({ error: "Event is closed" }, 400);

    const candidates = await repo.candidates.findByEventId(eventId);
    const autoVotes: Array<{ candidateId: string; label: string; answer: string }> = [];
    const skipped: string[] = [];

    for (const cand of candidates) {
      const answer = await generateAutoReply(ctx.db.raw, userId, cand.label);
      if (answer === null) {
        skipped.push(cand.id);
        continue;
      }

      const existing = await repo.votes.findExisting(eventId, cand.id, userId);
      if (existing) {
        await repo.votes.update(existing.id, {
          answer,
          isAutoReply: true,
          comment: "自動回答",
          updatedAt: new Date(),
        });
      } else {
        const voteId = uuidv4();
        await repo.votes.create({
          id: voteId,
          eventId,
          candidateId: cand.id,
          userId,
          answer,
          isAutoReply: true,
          comment: "自動回答",
        });
      }
      autoVotes.push({ candidateId: cand.id, label: cand.label, answer });
    }

    return c.json({
      autoVotes,
      skipped,
      message: skipped.length > 0
        ? `${autoVotes.length}件を自動回答、${skipped.length}件は解析不能のためスキップ`
        : `${autoVotes.length}件すべて自動回答しました`,
    });
  });

  app.put("/events/:eventId", async (c) => {
    const eventId = c.req.param("eventId");
    const userId = c.get("userId" as never) as string | undefined;
    if (!userId) return c.json({ error: "Authentication required" }, 401);
    const body = await c.req.json<{
      status?: string;
      title?: string;
      description?: string;
      deadline?: string;
    }>();

    const event = await repo.events.findById(eventId);
    if (!event) return c.json({ error: "Event not found" }, 404);
    if (event.createdBy !== userId) {
      return c.json({ error: "Only the creator can update this event" }, 403);
    }

    const updates: Partial<Record<string, unknown>> = { updatedAt: new Date() };
    if (body.status) updates.status = body.status;
    if (body.title) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.deadline !== undefined) updates.deadline = body.deadline;

    await repo.events.update(eventId, updates);
    const user = await ctx.users.get(userId);
    ctx.audit(userId, "投票イベント更新", `投票イベント「${event.title}」が更新されました (user: ${user.name})`);

    return c.json({ message: "Updated", eventId });
  });

  app.delete("/events/:eventId", async (c) => {
    const eventId = c.req.param("eventId");
    const userId = c.get("userId" as never) as string | undefined;
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const event = await repo.events.findById(eventId);
    if (!event) return c.json({ error: "Event not found" }, 404);
    if (event.createdBy !== userId) {
      return c.json({ error: "Only the creator can delete this event" }, 403);
    }

    await repo.votes.deleteByEventId(eventId);
    await repo.candidates.deleteByEventId(eventId);
    await repo.events.deleteById(eventId);

    return c.json({ message: "Deleted", eventId });
  });
}

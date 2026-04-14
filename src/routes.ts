/**
 * Smart-scheduler module — REST routes
 *
 * 移行元: Schedula/modules/smart-scheduler/routes.ts
 */

import { v4 as uuidv4 } from "uuid";
import type { Hono, Context } from "hono";
import type { ModuleContext } from "@ludiars/schedula-sdk";
import { makeRepo } from "./repo.js";
import { solve, type TaskInput } from "./solver.js";
import { calculateGroupAvailability } from "./availability.js";
import { DAYS_COUNT, PERIODS_COUNT } from "./constants.js";
import type { UnifiedSlot, AvailabilitySlot } from "./types.js";
import { getClassDays } from "./holiday-utils.js";

function getUserId(c: Context): string | undefined {
  return c.get("userId" as never) as string | undefined;
}

export function registerRoutes(app: Hono, ctx: ModuleContext): void {
  const repo = makeRepo(ctx.db.raw);

  async function verifyGroupMember(userId: string, groupId: string): Promise<boolean> {
    const memberships = await repo.members.findByUserId(userId);
    return memberships.some((m) => m.groupId === groupId);
  }

  async function getGroupAvailability(groupId: string): Promise<{
    availability: AvailabilitySlot[];
    totalMembers: number;
  }> {
    const memberships = await repo.members.findByGroupId(groupId);
    const memberUserIds = memberships.map((m) => m.userId);

    if (memberUserIds.length === 0) {
      return { availability: [], totalMembers: 0 };
    }

    const memberSlots: { userId: string; slots: UnifiedSlot[][] }[] = [];

    for (const uid of memberUserIds) {
      const slots: UnifiedSlot[][] = Array.from({ length: DAYS_COUNT }, (_, day) =>
        Array.from({ length: PERIODS_COUNT }, (_, period) => ({
          day,
          period,
          status: "free" as const,
          majorLabel: null,
          isPrivate: false,
          sourceModule: "smart-scheduler",
        })),
      );

      const events = await repo.personalEvents.findByUserId(uid);
      for (const ev of events) {
        for (let p = ev.period; p < ev.period + ev.duration && p < PERIODS_COUNT; p++) {
          if (ev.day >= 0 && ev.day < DAYS_COUNT) {
            slots[ev.day][p] = { ...slots[ev.day][p], status: "personal" };
          }
        }
      }

      const groupScheds = await repo.groupSchedules.findByGroupId(groupId);
      for (const gs of groupScheds) {
        for (let p = gs.period; p < gs.period + gs.duration && p < PERIODS_COUNT; p++) {
          if (gs.day >= 0 && gs.day < DAYS_COUNT) {
            slots[gs.day][p] = { ...slots[gs.day][p], status: "reserved" };
          }
        }
      }

      memberSlots.push({ userId: uid, slots });
    }

    const emptyRoomMap = new Map<string, string[]>();
    const availability = calculateGroupAvailability(memberSlots, emptyRoomMap);
    return { availability, totalMembers: memberUserIds.length };
  }

  // GET /tasks/:groupId
  app.get("/tasks/:groupId", async (c) => {
    const userId = getUserId(c);
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const groupId = c.req.param("groupId");
    if (!(await verifyGroupMember(userId, groupId))) {
      return c.json({ error: "Not a group member" }, 403);
    }

    const tasks = await repo.tasks.findByGroupId(groupId);
    return c.json({ tasks });
  });

  // POST /tasks
  app.post("/tasks", async (c) => {
    const userId = getUserId(c);
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const body = await c.req.json<{
      groupId: string;
      title: string;
      duration?: number;
      priority?: number;
      preferredDays?: number[];
      preferredPeriods?: number[];
      instructorId?: string;
    }>();

    if (!body.groupId || !body.title) {
      return c.json({ error: "groupId and title are required" }, 400);
    }
    if (!(await verifyGroupMember(userId, body.groupId))) {
      return c.json({ error: "Not a group member" }, 403);
    }

    const now = new Date();
    const task = {
      id: uuidv4(),
      groupId: body.groupId,
      title: body.title,
      duration: body.duration || 1,
      priority: body.priority || 0,
      preferredDays: body.preferredDays || [],
      preferredPeriods: body.preferredPeriods || [],
      instructorId: body.instructorId || null,
      status: "pending",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    await repo.tasks.create(task);

    const user = await ctx.users.get(userId);
    ctx.audit(userId, "スケジュールタスク作成", `タスク「${body.title}」が追加 (user: ${user.name})`);

    return c.json({ task }, 201);
  });

  // PUT /tasks/:id
  app.put("/tasks/:id", async (c) => {
    const userId = getUserId(c);
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const taskId = c.req.param("id");
    const existing = await repo.tasks.findById(taskId);
    if (!existing) return c.json({ error: "Task not found" }, 404);

    if (!(await verifyGroupMember(userId, existing.groupId))) {
      return c.json({ error: "Not a group member" }, 403);
    }

    const body = await c.req.json<{
      title?: string;
      duration?: number;
      priority?: number;
      preferredDays?: number[];
      preferredPeriods?: number[];
      instructorId?: string | null;
    }>();

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.duration !== undefined) updates.duration = body.duration;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.preferredDays !== undefined) updates.preferredDays = body.preferredDays;
    if (body.preferredPeriods !== undefined) updates.preferredPeriods = body.preferredPeriods;
    if (body.instructorId !== undefined) updates.instructorId = body.instructorId;

    await repo.tasks.update(taskId, updates);
    const updated = await repo.tasks.findById(taskId);

    const user = await ctx.users.get(userId);
    ctx.audit(userId, "スケジュールタスク更新", `タスク「${updated?.title || taskId}」が更新 (user: ${user.name})`);

    return c.json({ task: updated });
  });

  // DELETE /tasks/:id
  app.delete("/tasks/:id", async (c) => {
    const userId = getUserId(c);
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const taskId = c.req.param("id");
    const existing = await repo.tasks.findById(taskId);
    if (!existing) return c.json({ error: "Task not found" }, 404);

    if (!(await verifyGroupMember(userId, existing.groupId))) {
      return c.json({ error: "Not a group member" }, 403);
    }

    await repo.tasks.deleteById(taskId);
    return c.json({ message: "Task deleted" });
  });

  // POST /solve/:groupId
  app.post("/solve/:groupId", async (c) => {
    const userId = getUserId(c);
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const groupId = c.req.param("groupId");
    if (!(await verifyGroupMember(userId, groupId))) {
      return c.json({ error: "Not a group member" }, 403);
    }

    let body: { considerHolidays?: boolean; considerBusinessDays?: boolean } = {};
    try {
      body = await c.req.json();
    } catch {
      /* no body OK */
    }

    const pendingTasks = await repo.tasks.findPendingByGroupId(groupId);
    if (pendingTasks.length === 0) {
      return c.json({ error: "No pending tasks to schedule" }, 400);
    }

    const { availability, totalMembers } = await getGroupAvailability(groupId);
    if (totalMembers === 0) {
      return c.json({ error: "Group has no members" }, 400);
    }

    const classDays = getClassDays({ considerBusinessDays: body.considerBusinessDays });
    const filteredAvailability = availability.filter((slot) => classDays.has(slot.day));

    const instructorAvailMap = new Map<string, Set<string>>();
    const instructorIds = [
      ...new Set(pendingTasks.map((t) => t.instructorId).filter((id): id is string => !!id)),
    ];
    for (const instrId of instructorIds) {
      const slots = await repo.instructorSlots.findByInstructor(instrId);
      const slotKeys = new Set<string>();
      for (const slot of slots) {
        const periods = (typeof slot.periods === "string"
          ? JSON.parse(slot.periods)
          : slot.periods) as number[];
        for (const p of periods) slotKeys.add(`${slot.day}-${p}`);
      }
      instructorAvailMap.set(instrId, slotKeys);
    }

    const taskInputs: TaskInput[] = pendingTasks.map((t) => ({
      id: t.id,
      title: t.title,
      duration: t.duration,
      priority: t.priority,
      preferredDays: (t.preferredDays as number[]) || [],
      preferredPeriods: (t.preferredPeriods as number[]) || [],
      instructorId: t.instructorId || undefined,
    }));

    const instructorFilteredAvailability = (taskInstructorId: string | undefined) => {
      if (!taskInstructorId) return filteredAvailability;
      const instrSlots = instructorAvailMap.get(taskInstructorId);
      if (!instrSlots) return [];
      return filteredAvailability.filter((slot) =>
        instrSlots.has(`${slot.day}-${slot.period}`),
      );
    };

    const solveResult = solve(
      taskInputs,
      filteredAvailability,
      totalMembers,
      instructorFilteredAvailability,
    );

    const resultId = uuidv4();
    await repo.results.create({
      id: resultId,
      groupId,
      status: "draft",
      placements: solveResult.placements,
      totalScore: solveResult.totalScore,
      createdBy: userId,
      createdAt: new Date(),
    });

    const user = await ctx.users.get(userId);
    ctx.audit(
      userId,
      "自動配置実行",
      `グループ(${groupId})の自動配置を実行しました (${solveResult.placements.length}件配置、user: ${user.name})`,
    );

    return c.json({
      resultId,
      placements: solveResult.placements,
      totalScore: solveResult.totalScore,
      unplacedTaskIds: solveResult.unplacedTaskIds,
      totalMembers,
    });
  });

  // POST /confirm/:resultId
  app.post("/confirm/:resultId", async (c) => {
    const userId = getUserId(c);
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const resultId = c.req.param("resultId");
    const result = await repo.results.findById(resultId);
    if (!result) return c.json({ error: "Result not found" }, 404);

    if (result.status !== "draft") {
      return c.json({ error: "Result is not in draft status" }, 400);
    }
    if (!(await verifyGroupMember(userId, result.groupId))) {
      return c.json({ error: "Not a group member" }, 403);
    }

    const placements = result.placements as Array<{
      taskId: string;
      title: string;
      day: number;
      period: number;
      duration: number;
      score: number;
    }>;

    for (const p of placements) {
      await repo.tasks.update(p.taskId, { status: "placed", updatedAt: new Date() });
    }

    await repo.results.update(resultId, { status: "confirmed" });

    const user = await ctx.users.get(userId);
    ctx.audit(
      userId,
      "配置結果確定",
      `配置結果(${resultId})を確定 (${placements.length}件、user: ${user.name})`,
    );

    return c.json({ message: "Schedule confirmed", placements });
  });

  // GET /results/:groupId
  app.get("/results/:groupId", async (c) => {
    const userId = getUserId(c);
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const groupId = c.req.param("groupId");
    if (!(await verifyGroupMember(userId, groupId))) {
      return c.json({ error: "Not a group member" }, 403);
    }

    const results = await repo.results.findByGroupId(groupId);
    return c.json({ results });
  });

  // GET /availability/:groupId
  app.get("/availability/:groupId", async (c) => {
    const userId = getUserId(c);
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const groupId = c.req.param("groupId");
    if (!(await verifyGroupMember(userId, groupId))) {
      return c.json({ error: "Not a group member" }, 403);
    }

    const { availability, totalMembers } = await getGroupAvailability(groupId);
    return c.json({ availability, totalMembers });
  });
}

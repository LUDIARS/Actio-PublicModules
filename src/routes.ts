/**
 * MyPlan module — REST routes
 */

import { v4 as uuidv4 } from "uuid";
import type { Hono } from "hono";
import type { ModuleContext } from "@ludiars/schedula-sdk";
import { makeRepo } from "./repo.js";

interface WeeklySlot {
  startTime: string;
  endTime: string;
  title: string;
  period?: number;
  duration?: number;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function timeToPeriod(time: string): number {
  const minutes = timeToMinutes(time);
  const periodStart = 9 * 60 + 30;
  return Math.max(0, Math.floor((minutes - periodStart) / 60));
}

async function generateScheduleFromMyPlan(
  ctx: ModuleContext,
  planId: string,
  userId: string,
  plan: { name: string; weeklySchedule: Record<string, WeeklySlot[]> },
): Promise<number> {
  const repo = makeRepo(ctx.db.raw);
  await repo.events.deleteByUserAndPlan(userId, planId);

  const now = new Date();
  let created = 0;

  for (const [dayKey, slots] of Object.entries(plan.weeklySchedule)) {
    const day = parseInt(dayKey);
    if (day < 0 || day > 6) continue;

    for (const slot of slots) {
      const startTime = slot.startTime;
      const endTime = slot.endTime;
      const period = startTime ? timeToPeriod(startTime) : (slot.period ?? 0);
      const startMin = startTime ? timeToMinutes(startTime) : undefined;
      const endMin = endTime ? timeToMinutes(endTime) : undefined;
      const duration = (startMin != null && endMin != null)
        ? Math.max(1, Math.ceil((endMin - startMin) / 60))
        : (slot.duration ?? 1);

      const conflict = await repo.events.findByUserDayPeriod(userId, day, period);
      if (conflict) continue;

      await repo.events.create({
        id: uuidv4(),
        userId,
        title: slot.title || plan.name,
        day,
        period,
        duration,
        startTime: startTime || null,
        endTime: endTime || null,
        eventType: "personal",
        planId,
        isPrivate: 1,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }
  }
  return created;
}

export function registerRoutes(app: Hono, ctx: ModuleContext): void {
  const repo = makeRepo(ctx.db.raw);

  app.get("/", async (c) => {
    const userId = c.get("userId" as never) as string | undefined;
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const plans = await repo.plans.findByUserId(userId);
    plans.sort((a, b) => {
      if (a.patternType !== b.patternType) {
        return a.patternType === "special" ? -1 : 1;
      }
      return b.priority - a.priority;
    });
    return c.json({ plans });
  });

  app.post("/", async (c) => {
    const userId = c.get("userId" as never) as string | undefined;
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const body = await c.req.json<{
      name: string;
      patternType?: string;
      validFrom?: string;
      validUntil?: string;
      weeklySchedule?: Record<string, WeeklySlot[]>;
      groupId?: string;
    }>();

    if (!body.name) return c.json({ error: "name is required" }, 400);

    const planId = uuidv4();
    const now = new Date();
    const patternType = body.patternType || "basic";
    const priority = patternType === "special" ? 10 : 0;

    await repo.plans.create({
      id: planId,
      userId,
      groupId: body.groupId || null,
      name: body.name,
      patternType,
      validFrom: body.validFrom || null,
      validUntil: body.validUntil || null,
      weeklySchedule: JSON.stringify(body.weeklySchedule || {}),
      isActive: 1,
      priority,
      createdAt: now,
      updatedAt: now,
    });

    let generatedEvents = 0;
    if (body.weeklySchedule && Object.keys(body.weeklySchedule).length > 0) {
      generatedEvents = await generateScheduleFromMyPlan(ctx, planId, userId, {
        name: body.name,
        weeklySchedule: body.weeklySchedule,
      });
    }

    const plan = await repo.plans.findById(planId);
    const user = await ctx.users.get(userId);
    ctx.audit(userId, "マイプラン作成", `マイプラン「${body.name}」が追加されました (user: ${user.name})`);

    return c.json({ plan, generatedEvents }, 201);
  });

  app.put("/:id", async (c) => {
    const userId = c.get("userId" as never) as string | undefined;
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const planId = c.req.param("id");
    const existing = await repo.plans.findByIdAndUserId(planId, userId);
    if (!existing) return c.json({ error: "MyPlan not found" }, 404);

    const body = await c.req.json<{
      name?: string;
      patternType?: string;
      validFrom?: string;
      validUntil?: string;
      weeklySchedule?: Record<string, WeeklySlot[]>;
      isActive?: boolean;
    }>();

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.patternType !== undefined) {
      updates.patternType = body.patternType;
      updates.priority = body.patternType === "special" ? 10 : 0;
    }
    if (body.validFrom !== undefined) updates.validFrom = body.validFrom;
    if (body.validUntil !== undefined) updates.validUntil = body.validUntil;
    if (body.weeklySchedule !== undefined) {
      updates.weeklySchedule = JSON.stringify(body.weeklySchedule);
    }
    if (body.isActive !== undefined) updates.isActive = body.isActive ? 1 : 0;

    await repo.plans.update(planId, updates);
    const updated = await repo.plans.findById(planId);

    let generatedEvents = 0;
    if (updated?.isActive) {
      const ws = typeof updated.weeklySchedule === "string"
        ? JSON.parse(updated.weeklySchedule)
        : updated.weeklySchedule;
      generatedEvents = await generateScheduleFromMyPlan(ctx, planId, userId, {
        name: updated.name,
        weeklySchedule: ws as Record<string, WeeklySlot[]>,
      });
    } else {
      await repo.events.deleteByUserAndPlan(userId, planId);
    }

    const user = await ctx.users.get(userId);
    ctx.audit(userId, "マイプラン更新", `マイプラン「${updated?.name || planId}」が更新されました (user: ${user.name})`);

    return c.json({ plan: updated, generatedEvents });
  });

  app.delete("/:id", async (c) => {
    const userId = c.get("userId" as never) as string | undefined;
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const planId = c.req.param("id");
    const existing = await repo.plans.findByIdAndUserId(planId, userId);
    if (!existing) return c.json({ error: "MyPlan not found" }, 404);

    await repo.events.deleteByUserAndPlan(userId, planId);
    await repo.plans.deleteById(planId);

    return c.json({ message: "MyPlan and associated events deleted" });
  });

  app.post("/:id/generate", async (c) => {
    const userId = c.get("userId" as never) as string | undefined;
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const planId = c.req.param("id");
    const plan = await repo.plans.findByIdAndUserId(planId, userId);
    if (!plan) return c.json({ error: "MyPlan not found" }, 404);
    if (!plan.isActive) return c.json({ error: "MyPlan is not active" }, 400);

    const ws = typeof plan.weeklySchedule === "string"
      ? JSON.parse(plan.weeklySchedule)
      : plan.weeklySchedule;
    const createdCount = await generateScheduleFromMyPlan(ctx, planId, userId, {
      name: plan.name,
      weeklySchedule: ws as Record<string, WeeklySlot[]>,
    });

    return c.json({ generatedEvents: createdCount });
  });
}

export { generateScheduleFromMyPlan };

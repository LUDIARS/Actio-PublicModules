/**
 * MyPlan module — WS command handlers
 */

import { v4 as uuidv4 } from "uuid";
import type { WsCommandHandler } from "@ludiars/schedula-sdk";
import { makeRepo } from "./repo.js";
import { generateScheduleFromMyPlan } from "./routes.js";

interface WeeklySlot {
  startTime: string;
  endTime: string;
  title: string;
  period?: number;
  duration?: number;
}

interface CreateMyPlanPayload {
  name: string;
  patternType?: string;
  validFrom?: string;
  validUntil?: string;
  weeklySchedule?: Record<string, WeeklySlot[]>;
  groupId?: string;
}

const createPlan: WsCommandHandler<CreateMyPlanPayload> = async (userId, payload, ctx) => {
  const repo = makeRepo(ctx.db.raw);
  if (!payload.name) throw new Error("name is required");

  const planId = uuidv4();
  const now = new Date();
  const patternType = payload.patternType || "basic";
  const priority = patternType === "special" ? 10 : 0;

  await repo.plans.create({
    id: planId,
    userId,
    groupId: payload.groupId || null,
    name: payload.name,
    patternType,
    validFrom: payload.validFrom || null,
    validUntil: payload.validUntil || null,
    weeklySchedule: JSON.stringify(payload.weeklySchedule || {}),
    isActive: 1,
    priority,
    createdAt: now,
    updatedAt: now,
  });

  let generatedEvents = 0;
  if (payload.weeklySchedule && Object.keys(payload.weeklySchedule).length > 0) {
    generatedEvents = await generateScheduleFromMyPlan(ctx, planId, userId, {
      name: payload.name,
      weeklySchedule: payload.weeklySchedule,
    });
  }

  const plan = await repo.plans.findById(planId);
  const user = await ctx.users.get(userId);
  ctx.audit(userId, "マイプラン作成", `マイプラン「${payload.name}」が追加 (user: ${user.name})`);

  return { plan, generatedEvents };
};

interface UpdateMyPlanPayload {
  id: string;
  name?: string;
  patternType?: string;
  validFrom?: string;
  validUntil?: string;
  weeklySchedule?: Record<string, WeeklySlot[]>;
  isActive?: boolean;
}

const updatePlan: WsCommandHandler<UpdateMyPlanPayload> = async (userId, payload, ctx) => {
  const repo = makeRepo(ctx.db.raw);
  if (!payload.id) throw new Error("id is required");

  const existing = await repo.plans.findByIdAndUserId(payload.id, userId);
  if (!existing) throw new Error("MyPlan not found");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (payload.name !== undefined) updates.name = payload.name;
  if (payload.patternType !== undefined) {
    updates.patternType = payload.patternType;
    updates.priority = payload.patternType === "special" ? 10 : 0;
  }
  if (payload.validFrom !== undefined) updates.validFrom = payload.validFrom;
  if (payload.validUntil !== undefined) updates.validUntil = payload.validUntil;
  if (payload.weeklySchedule !== undefined) {
    updates.weeklySchedule = JSON.stringify(payload.weeklySchedule);
  }
  if (payload.isActive !== undefined) updates.isActive = payload.isActive ? 1 : 0;

  await repo.plans.update(payload.id, updates);
  const updated = await repo.plans.findById(payload.id);

  let generatedEvents = 0;
  if (updated?.isActive) {
    const ws = typeof updated.weeklySchedule === "string"
      ? JSON.parse(updated.weeklySchedule)
      : updated.weeklySchedule;
    generatedEvents = await generateScheduleFromMyPlan(ctx, payload.id, userId, {
      name: updated.name,
      weeklySchedule: ws as Record<string, WeeklySlot[]>,
    });
  } else {
    await repo.events.deleteByUserAndPlan(userId, payload.id);
  }

  const user = await ctx.users.get(userId);
  ctx.audit(userId, "マイプラン更新", `マイプラン「${updated?.name || payload.id}」が更新 (user: ${user.name})`);

  return { plan: updated, generatedEvents };
};

interface DeleteMyPlanPayload { id: string; }

const deletePlan: WsCommandHandler<DeleteMyPlanPayload> = async (userId, payload, ctx) => {
  const repo = makeRepo(ctx.db.raw);
  if (!payload.id) throw new Error("id is required");

  const existing = await repo.plans.findByIdAndUserId(payload.id, userId);
  if (!existing) throw new Error("MyPlan not found");

  await repo.events.deleteByUserAndPlan(userId, payload.id);
  await repo.plans.deleteById(payload.id);

  return { message: "MyPlan and associated events deleted" };
};

interface GenerateMyPlanPayload { id: string; }

const generatePlan: WsCommandHandler<GenerateMyPlanPayload> = async (userId, payload, ctx) => {
  const repo = makeRepo(ctx.db.raw);
  if (!payload.id) throw new Error("id is required");

  const plan = await repo.plans.findByIdAndUserId(payload.id, userId);
  if (!plan) throw new Error("MyPlan not found");
  if (!plan.isActive) throw new Error("MyPlan is not active");

  const ws = typeof plan.weeklySchedule === "string"
    ? JSON.parse(plan.weeklySchedule)
    : plan.weeklySchedule;
  const createdCount = await generateScheduleFromMyPlan(ctx, payload.id, userId, {
    name: plan.name,
    weeklySchedule: ws as Record<string, WeeklySlot[]>,
  });

  return { generatedEvents: createdCount };
};

export const wsCommands: Record<string, WsCommandHandler> = {
  create: createPlan as WsCommandHandler,
  update: updatePlan as WsCommandHandler,
  delete: deletePlan as WsCommandHandler,
  generate: generatePlan as WsCommandHandler,
};

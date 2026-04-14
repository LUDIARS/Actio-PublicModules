/**
 * Holiday module — REST routes
 */

import { v4 as uuidv4 } from "uuid";
import type { Hono } from "hono";
import type { ModuleContext } from "@ludiars/schedula-sdk";
import { makeRepo } from "./repo.js";
import { getJapaneseHolidays, isNonBusinessDay } from "./japanese-holidays.js";

export function registerRoutes(app: Hono, ctx: ModuleContext): void {
  const repo = makeRepo(ctx.db.raw);

  // GET /japanese/:year
  app.get("/japanese/:year", async (c) => {
    const year = parseInt(c.req.param("year"));
    if (isNaN(year) || year < 1900 || year > 2100) {
      return c.json({ error: "Invalid year" }, 400);
    }
    const holidays = getJapaneseHolidays(year);
    return c.json({ holidays, year });
  });

  // POST /japanese/sync
  app.post("/japanese/sync", async (c) => {
    const userId = c.get("userId" as never) as string | undefined;
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const { year, groupId } = await c.req.json<{ year?: number; groupId?: string }>();
    const targetYear = year || new Date().getFullYear();

    if (groupId) {
      const membership = await repo.members.findByGroupAndUser(groupId, userId);
      if (!membership) return c.json({ error: "Not a group member" }, 403);
    }

    const holidays = getJapaneseHolidays(targetYear);
    const source = `japanese_holidays_${targetYear}`;
    await repo.holidays.deleteBySource(source, groupId || undefined);

    let created = 0;
    for (const h of holidays) {
      await repo.holidays.create({
        id: uuidv4(),
        groupId: groupId || null,
        name: h.name,
        date: h.date,
        endDate: null,
        holidayType: "national_holiday",
        recurrence: "none",
        source,
        createdBy: userId,
      });
      created++;
    }

    const user = await ctx.users.get(userId);
    ctx.audit(userId, "祝日同期", `${targetYear}年の日本の祝日を${created}件登録 (user: ${user.name})`);

    return c.json({
      message: `${targetYear}年の祝日を${created}件登録しました`,
      year: targetYear,
      count: created,
    });
  });

  // GET /
  app.get("/", async (c) => {
    const userId = c.get("userId" as never) as string | undefined;
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const groupId = c.req.query("groupId");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");

    let holidays;
    if (startDate && endDate) {
      holidays = await repo.holidays.findByDateRange(startDate, endDate, groupId || undefined);
    } else if (groupId) {
      holidays = await repo.holidays.findForGroup(groupId);
    } else {
      holidays = await repo.holidays.findAll();
    }

    return c.json({ holidays });
  });

  // POST /
  app.post("/", async (c) => {
    const userId = c.get("userId" as never) as string | undefined;
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const body = await c.req.json<{
      groupId?: string;
      name: string;
      date: string;
      endDate?: string;
      holidayType?: string;
      recurrence?: string;
    }>();

    if (!body.name || !body.date) {
      return c.json({ error: "name and date are required" }, 400);
    }

    if (body.groupId) {
      const membership = await repo.members.findByGroupAndUser(body.groupId, userId);
      if (!membership) return c.json({ error: "Not a group member" }, 403);
    }

    const id = uuidv4();
    await repo.holidays.create({
      id,
      groupId: body.groupId || null,
      name: body.name,
      date: body.date,
      endDate: body.endDate || null,
      holidayType: body.holidayType || "custom",
      recurrence: body.recurrence || "none",
      source: null,
      createdBy: userId,
    });

    const user = await ctx.users.get(userId);
    ctx.audit(userId, "休日追加", `休日「${body.name}」を追加 (user: ${user.name})`);

    return c.json({ id, name: body.name, date: body.date }, 201);
  });

  // DELETE /:id
  app.delete("/:id", async (c) => {
    const userId = c.get("userId" as never) as string | undefined;
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const id = c.req.param("id");
    const holiday = await repo.holidays.findById(id);
    if (!holiday) return c.json({ error: "Holiday not found" }, 404);

    await repo.holidays.deleteById(id);
    return c.json({ deleted: id });
  });

  // GET /check/:date
  app.get("/check/:date", async (c) => {
    const dateStr = c.req.param("date");
    const groupId = c.req.query("groupId");

    const isNonBusiness = isNonBusinessDay(dateStr);

    const dbHolidays = groupId
      ? await repo.holidays.findByDateRange(dateStr, dateStr, groupId)
      : await repo.holidays.findByDateRange(dateStr, dateStr);

    const isHoliday = isNonBusiness || dbHolidays.length > 0;

    return c.json({
      date: dateStr,
      isHoliday,
      isWeekend: isNonBusiness && !getJapaneseHolidays(parseInt(dateStr.slice(0, 4))).some((h) => h.date === dateStr),
      isNationalHoliday: isNonBusiness,
      dbHolidays: dbHolidays.map((h) => ({ name: h.name, type: h.holidayType })),
    });
  });
}

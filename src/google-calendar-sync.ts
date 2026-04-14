/**
 * Google Calendar 同期
 *
 * personalEvents を Google Calendar に push/pull する。
 * OAuth token は Cernere (ctx.oauth) に保管する — 個人データ保管禁止ルール準拠。
 */

import { v4 as uuidv4 } from "uuid";
import type { Hono, Context } from "hono";
import type { ModuleContext } from "@ludiars/schedula-sdk";
import type { makeRepo } from "./repo.js";

type Repo = ReturnType<typeof makeRepo>;

const GOOGLE_PROVIDER = "google";

function getUserId(c: Context): string | undefined {
  return c.get("userId" as never) as string | undefined;
}

function periodToDateTime(day: number, period: number, baseDate?: Date): { start: string; end: string } {
  const base = baseDate || getNextWeekday(day);
  const startHour = 9 + Math.floor((30 + period * 60) / 60);
  const startMin = (30 + period * 60) % 60;

  const start = new Date(base);
  start.setHours(startHour, startMin, 0, 0);
  const end = new Date(start);
  end.setHours(startHour + 1, startMin, 0, 0);

  return { start: start.toISOString(), end: end.toISOString() };
}

function getNextWeekday(day: number): Date {
  const jsDay = (day + 1) % 7;
  const now = new Date();
  const currentDay = now.getDay();
  const diff = (jsDay - currentDay + 7) % 7;
  const result = new Date(now);
  result.setDate(now.getDate() + (diff === 0 ? 7 : diff));
  return result;
}

/**
 * Cernere から Google OAuth token を取得し、必要に応じてリフレッシュする。
 */
async function getValidGoogleToken(
  ctx: ModuleContext,
  userId: string,
): Promise<string | null> {
  const token = await ctx.oauth.get(userId, GOOGLE_PROVIDER);
  if (!token?.refreshToken) return null;

  // 有効期限チェック (60秒のマージン)
  if (token.expiresAt) {
    const expiresAtMs = new Date(token.expiresAt).getTime();
    if (expiresAtMs > Date.now() + 60_000 && token.accessToken) {
      return token.accessToken;
    }
  }

  const clientId = ctx.secrets.getOrDefault("GOOGLE_CLIENT_ID", "");
  const clientSecret = ctx.secrets.getOrDefault("GOOGLE_CLIENT_SECRET", "");
  if (!clientId || !clientSecret) {
    console.error("[gcal-sync] GOOGLE_CLIENT_ID/SECRET not configured");
    return null;
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: token.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      console.error("[gcal-sync] Token refresh failed:", await res.text());
      return null;
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    await ctx.oauth.store(userId, {
      provider: GOOGLE_PROVIDER,
      accessToken: data.access_token,
      refreshToken: token.refreshToken,
      expiresAt,
      tokenType: token.tokenType,
      scope: token.scope,
      metadata: token.metadata,
    });

    return data.access_token;
  } catch (err) {
    console.error("[gcal-sync] Token refresh error:", err);
    return null;
  }
}

function hasWriteScopeFromToken(scope: string | null): boolean {
  if (!scope) return false;
  return scope.split(/\s+/).some((s) => s.includes("calendar.events") && !s.includes("readonly"));
}

export function registerGoogleCalendarRoutes(app: Hono, repo: Repo, ctx: ModuleContext): void {
  // GET /status
  app.get("/status", async (c) => {
    const userId = getUserId(c);
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const token = await ctx.oauth.get(userId, GOOGLE_PROVIDER);
    const canWrite = hasWriteScopeFromToken(token?.scope ?? null);
    const setting = await repo.settings.findByUserAndService(userId, "google_calendar");

    return c.json({
      connected: !!token?.refreshToken,
      hasWriteScope: canWrite,
      syncEnabled: (setting?.isActive ?? 0) === 1,
      config: setting?.config || {},
    });
  });

  // POST /enable
  app.post("/enable", async (c) => {
    const userId = getUserId(c);
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const token = await ctx.oauth.get(userId, GOOGLE_PROVIDER);
    if (!hasWriteScopeFromToken(token?.scope ?? null)) {
      return c.json(
        {
          error: "書き込み権限が不足しています。Google Calendar連携を再設定してください。",
          needsReauth: true,
        },
        403,
      );
    }

    const body = await c.req.json<{ calendarId?: string }>().catch(() => ({}) as { calendarId?: string });

    await repo.settings.upsert({
      id: uuidv4(),
      userId,
      service: "google_calendar",
      isActive: 1,
      config: { calendarId: body.calendarId || "primary" },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const user = await ctx.users.get(userId);
    ctx.audit(userId, "Google Calendar同期有効化", `Google Calendarへの同期が有効 (user: ${user.name})`);

    return c.json({ message: "Google Calendar sync enabled" });
  });

  // POST /disable
  app.post("/disable", async (c) => {
    const userId = getUserId(c);
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const setting = await repo.settings.findByUserAndService(userId, "google_calendar");
    if (setting) {
      await repo.settings.update(setting.id, { isActive: 0 });
    }
    return c.json({ message: "Google Calendar sync disabled" });
  });

  // POST /push/:eventId
  app.post("/push/:eventId", async (c) => {
    const userId = getUserId(c);
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const eventId = c.req.param("eventId");
    const event = await repo.personalEvents.findByIdAndUserId(eventId, userId);
    if (!event) return c.json({ error: "Event not found" }, 404);

    const accessToken = await getValidGoogleToken(ctx, userId);
    if (!accessToken) return c.json({ error: "Google認証が必要です" }, 401);

    const setting = await repo.settings.findByUserAndService(userId, "google_calendar");
    const calendarId = ((setting?.config as Record<string, unknown>)?.calendarId as string) || "primary";

    const { start, end } = periodToDateTime(event.day, event.period);
    const gcalEvent = {
      summary: event.title,
      description: event.description || `Schedula予定 (${event.eventType})`,
      start: { dateTime: start, timeZone: "Asia/Tokyo" },
      end: { dateTime: end, timeZone: "Asia/Tokyo" },
    };

    try {
      let gcalResponse: Response;
      let action: string;

      if (event.googleCalendarEventId) {
        gcalResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${event.googleCalendarEventId}`,
          {
            method: "PUT",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(gcalEvent),
          },
        );
        action = "update";
      } else {
        gcalResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(gcalEvent),
          },
        );
        action = "create";
      }

      if (!gcalResponse.ok) {
        const errBody = await gcalResponse.text();
        console.error("[gcal-sync] Push failed:", errBody);
        await repo.syncLogs.create({
          id: uuidv4(),
          userId,
          service: "google_calendar",
          action: `sync_push_${action}`,
          localEventId: eventId,
          status: "error",
          errorMessage: errBody,
          createdAt: new Date(),
        });
        return c.json({ error: "Google Calendar APIエラー" }, 502);
      }

      const result = (await gcalResponse.json()) as { id: string };
      await repo.personalEvents.update(eventId, { googleCalendarEventId: result.id });
      await repo.syncLogs.create({
        id: uuidv4(),
        userId,
        service: "google_calendar",
        action: `sync_push_${action}`,
        localEventId: eventId,
        externalId: result.id,
        status: "success",
        createdAt: new Date(),
      });

      return c.json({
        message: action === "create" ? "Google Calendarに予定を作成しました" : "Google Calendarの予定を更新しました",
        googleCalendarEventId: result.id,
      });
    } catch (err) {
      console.error("[gcal-sync] Push error:", err);
      return c.json({ error: "同期エラー" }, 500);
    }
  });

  // POST /push-all
  app.post("/push-all", async (c) => {
    const userId = getUserId(c);
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const accessToken = await getValidGoogleToken(ctx, userId);
    if (!accessToken) return c.json({ error: "Google認証が必要です" }, 401);

    const token = await ctx.oauth.get(userId, GOOGLE_PROVIDER);
    if (!hasWriteScopeFromToken(token?.scope ?? null)) {
      return c.json({ error: "書き込み権限が不足しています" }, 403);
    }

    const events = await repo.personalEvents.findByUserId(userId);
    const setting = await repo.settings.findByUserAndService(userId, "google_calendar");
    const calendarId = ((setting?.config as Record<string, unknown>)?.calendarId as string) || "primary";

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const event of events) {
      const { start, end } = periodToDateTime(event.day, event.period);
      const gcalEvent = {
        summary: event.title,
        description: event.description || `Schedula予定 (${event.eventType})`,
        start: { dateTime: start, timeZone: "Asia/Tokyo" },
        end: { dateTime: end, timeZone: "Asia/Tokyo" },
      };

      try {
        let res: Response;
        if (event.googleCalendarEventId) {
          res = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${event.googleCalendarEventId}`,
            {
              method: "PUT",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify(gcalEvent),
            },
          );
          if (res.ok) updated++;
          else errors++;
        } else {
          res = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify(gcalEvent),
            },
          );
          if (res.ok) {
            const result = (await res.json()) as { id: string };
            await repo.personalEvents.update(event.id, { googleCalendarEventId: result.id });
            created++;
          } else {
            errors++;
          }
        }
      } catch {
        errors++;
      }
    }

    await repo.syncLogs.create({
      id: uuidv4(),
      userId,
      service: "google_calendar",
      action: "sync_push_all",
      status: errors > 0 ? "error" : "success",
      errorMessage: errors > 0 ? `${errors} events failed` : null,
      createdAt: new Date(),
    });

    const user = await ctx.users.get(userId);
    ctx.audit(
      userId,
      "Google Calendar一括同期",
      `${created}件作成, ${updated}件更新, ${errors}件失敗 (user: ${user.name})`,
    );

    return c.json({ created, updated, errors, total: events.length });
  });

  // DELETE /push/:eventId
  app.delete("/push/:eventId", async (c) => {
    const userId = getUserId(c);
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const eventId = c.req.param("eventId");
    const event = await repo.personalEvents.findByIdAndUserId(eventId, userId);
    if (!event) return c.json({ error: "Event not found" }, 404);

    if (!event.googleCalendarEventId) {
      return c.json({ error: "この予定はGoogle Calendarに同期されていません" }, 400);
    }

    const accessToken = await getValidGoogleToken(ctx, userId);
    if (!accessToken) return c.json({ error: "Google認証が必要です" }, 401);

    const setting = await repo.settings.findByUserAndService(userId, "google_calendar");
    const calendarId = ((setting?.config as Record<string, unknown>)?.calendarId as string) || "primary";

    try {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${event.googleCalendarEventId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!res.ok && res.status !== 410) {
        return c.json({ error: "Google Calendar削除エラー" }, 502);
      }

      await repo.personalEvents.update(eventId, { googleCalendarEventId: null });
      await repo.syncLogs.create({
        id: uuidv4(),
        userId,
        service: "google_calendar",
        action: "sync_push_delete",
        localEventId: eventId,
        externalId: event.googleCalendarEventId,
        status: "success",
        createdAt: new Date(),
      });

      return c.json({ message: "Google Calendarから予定を削除しました" });
    } catch (err) {
      console.error("[gcal-sync] Delete error:", err);
      return c.json({ error: "削除エラー" }, 500);
    }
  });

  // GET /logs
  app.get("/logs", async (c) => {
    const userId = getUserId(c);
    if (!userId) return c.json({ error: "Authentication required" }, 401);
    const logs = await repo.syncLogs.findByUserAndService(userId, "google_calendar");
    return c.json({ logs });
  });
}

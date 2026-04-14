/**
 * Integrations module — REST routes registration
 *
 * basePath `/api/integrations` 配下に以下をマウント:
 *   /google-calendar/*  — Google Calendar 同期
 *   /notion/*           — Notion 連携
 */

import { Hono } from "hono";
import type { ModuleContext } from "@ludiars/schedula-sdk";
import { makeRepo } from "./repo.js";
import { registerGoogleCalendarRoutes } from "./google-calendar-sync.js";
import { registerNotionRoutes } from "./notion.js";

export function registerRoutes(app: Hono, ctx: ModuleContext): void {
  const repo = makeRepo(ctx.db.raw);

  const gcalApp = new Hono();
  registerGoogleCalendarRoutes(gcalApp, repo, ctx);
  app.route("/google-calendar", gcalApp);

  const notionApp = new Hono();
  registerNotionRoutes(notionApp, repo, ctx);
  app.route("/notion", notionApp);
}

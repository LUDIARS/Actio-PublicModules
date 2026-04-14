/**
 * @ludiars/schedula-module-integrations
 *
 * Google Calendar + Notion 連携モジュール。
 * OAuth トークンは Cernere (ctx.oauth) に保管 — 個人データ保管禁止ルール準拠。
 */

import { defineModule } from "@ludiars/schedula-sdk";
import { registerRoutes } from "./routes.js";

export default defineModule({
  id: "integrations",
  name: "外部サービス連携",
  description: "Google Calendar / Notion 同期 — OAuth token は Cernere に委任",
  version: "0.1.0",
  schedulaApiVersion: "^1.0.0",
  scope: "per-user",
  basePath: "/api/integrations",
  routes: registerRoutes,
});

export { registerRoutes } from "./routes.js";
export { makeRepo } from "./repo.js";
export * from "./tables.js";

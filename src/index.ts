/**
 * @ludiars/schedula-module-integrations (skeleton)
 *
 * Google Calendar / Notion 連携モジュール — Phase 2 では skeleton のみ。
 * legacy users.google_* / integrationSettingRepo / syncLogRepo 依存のため
 * Cernere 移行と合わせて段階的に本実装する。
 */

import { defineModule } from "@ludiars/schedula-sdk";

export default defineModule({
  id: "integrations",
  name: "外部サービス連携 (skeleton)",
  description: "Phase 2 skeleton — 実装は Schedula 本体側。Cernere 移行と連動して移設予定。",
  version: "0.1.0",
  schedulaApiVersion: "^1.0.0",
  scope: "per-user",
  basePath: "/api/integrations-ext",
  routes: (app) => {
    app.get("/info", (c) => c.json({
      module: "integrations",
      status: "skeleton",
      message: "Integrations module is awaiting Cernere OAuth/data-sharing migration.",
    }));
  },
});

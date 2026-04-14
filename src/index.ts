/**
 * @ludiars/schedula-module-smart-scheduler (skeleton)
 *
 * DP ベースの自動配置スケジューラ — Phase 2 では skeleton のみ。
 * 9 repos 依存 + 750行のため段階移行が必要。
 */

import { defineModule } from "@ludiars/schedula-sdk";

export default defineModule({
  id: "smart-scheduler",
  name: "スマートスケジューラ (skeleton)",
  description: "Phase 2 skeleton — 実装は Schedula 本体側。Phase 3 で本格移行。",
  version: "0.1.0",
  schedulaApiVersion: "^1.0.0",
  scope: "per-group",
  depends: ["holiday"],
  basePath: "/api/smart-scheduler-ext",
  routes: (app) => {
    app.get("/info", (c) => c.json({
      module: "smart-scheduler",
      status: "skeleton",
      message: "Smart-scheduler module is under migration. Full implementation remains in Schedula host.",
    }));
  },
});

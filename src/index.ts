/**
 * @ludiars/schedula-module-smart-scheduler
 *
 * DP ベースの自動配置スケジューラ。グループメンバーの空き状況と
 * 講師スロット制約を考慮して、タスクを最適なコマに配置する。
 */

import { defineModule } from "@ludiars/schedula-sdk";
import { registerRoutes } from "./routes.js";

export default defineModule({
  id: "smart-scheduler",
  name: "スマートスケジューラ",
  description: "グループの自動配置スケジューラ (DP + greedy)",
  version: "0.1.0",
  schedulaApiVersion: "^1.0.0",
  scope: "per-group",
  depends: ["holiday"],
  basePath: "/api/smart-scheduler",
  routes: registerRoutes,
});

export { registerRoutes } from "./routes.js";
export { makeRepo } from "./repo.js";
export * from "./tables.js";
export { solve, type TaskInput, type Placement, type SolveResult } from "./solver.js";
export { calculateGroupAvailability } from "./availability.js";

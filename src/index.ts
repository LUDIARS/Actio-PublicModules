/**
 * @ludiars/schedula-module-holiday
 */

import { defineModule } from "@ludiars/schedula-sdk";
import { registerRoutes } from "./routes.js";

export default defineModule({
  id: "holiday",
  name: "休日管理",
  description: "日本の祝日自動取得 + グループ別休業期間管理",
  version: "0.1.0",
  schedulaApiVersion: "^1.0.0",
  scope: "global",
  basePath: "/api/holidays",
  routes: registerRoutes,
});

export { registerRoutes } from "./routes.js";
export { makeRepo } from "./repo.js";
export * from "./tables.js";
export * from "./japanese-holidays.js";

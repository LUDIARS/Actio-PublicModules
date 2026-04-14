/**
 * @ludiars/schedula-module-myplan
 */

import { defineModule } from "@ludiars/schedula-sdk";
import { registerRoutes } from "./routes.js";
import { wsCommands } from "./ws-commands.js";

export default defineModule({
  id: "myplan",
  name: "MyPlan",
  description: "週間ルーティーン (繰り返し予定) と PersonalEvent への展開",
  version: "0.1.0",
  schedulaApiVersion: "^1.0.0",
  scope: "per-user",
  basePath: "/api/myplans",
  routes: registerRoutes,
  wsCommands,
});

export { registerRoutes, wsCommands };
export { makeRepo } from "./repo.js";
export * from "./tables.js";

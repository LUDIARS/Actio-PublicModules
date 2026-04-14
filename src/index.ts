/**
 * @ludiars/schedula-module-voting
 *
 * Voting module for Schedula. Entry point = defineModule() default export.
 */

import { defineModule } from "@ludiars/schedula-sdk";
import { registerRoutes } from "./routes.js";
import { wsCommands } from "./ws-commands.js";
import { makeRepo } from "./repo.js";

export default defineModule({
  id: "voting",
  name: "投票・日程調整",
  description: "候補日時を投票で決定する。自動回答 (空き時間を検出) もサポート",
  version: "0.1.0",
  schedulaApiVersion: "^1.0.0",
  scope: "per-group",

  basePath: "/api/voting",
  routes: registerRoutes,
  wsCommands,

  onUserOptout: async (ctx, userId) => {
    const repo = makeRepo(ctx.db.raw);
    await repo.votes.deleteByUserId(userId);
  },
});

export { registerRoutes, wsCommands, makeRepo };
export * from "./tables.js";

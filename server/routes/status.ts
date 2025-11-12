import { Router } from "@oak/oak";
import { manager } from "../TestSystemManager.ts";
import { getSecondTimestamp } from "../types.ts";

/**
 * 系统状态路由
 */
export const statusRouter = new Router();

// 系统状态
statusRouter.get("/status", (ctx) => {
  const clients = Object.values(manager.clients);

  ctx.response.body = {
    success: true,
    data: {
      timestamp: getSecondTimestamp(),
      connectedClients: clients.filter((c) => c.online).length,
      activeTests: clients.filter((c) => c.testSession).length,
      totalQuestions: manager.questions.length,
      totalTroubles: manager.getTroubles().length,
    },
  };
});

// Health check
statusRouter.get("/health", (ctx) => {
  ctx.response.body = { status: "ok", timestamp: getSecondTimestamp() };
});

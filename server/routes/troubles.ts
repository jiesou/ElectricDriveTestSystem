import { Router } from "@oak/oak";
import { manager } from "../TestSystemManager.ts";

/**
 * 故障管理路由
 */
export const troublesRouter = new Router();

// 获取故障列表
troublesRouter.get("/troubles", (ctx) => {
  ctx.response.body = {
    success: true,
    data: manager.getTroubles(),
  };
});

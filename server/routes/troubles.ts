import { Hono } from "hono";
import { troubleTest } from "./core/TroubleTest.ts";

export const troublesRouter = new Hono();

// 获取故障列表
troublesRouter.get("/", (c) => {
  return c.json({ success: true, data: troubleTest.getTroubles() });
});

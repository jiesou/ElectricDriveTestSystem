import { Router } from "@oak/oak";
import { manager } from "../TestSystemManager.ts";

/**
 * 客户机管理路由
 */
export const clientsRouter = new Router();

// 获取客户机列表
clientsRouter.get("/clients", (ctx) => {
  const clients = Object.values(manager.clients).map((client) => ({
    id: client.id,
    name: client.name,
    ip: client.ip,
    online: client.online,
    testSession: client.testSession || null,
    evaluateSession: client.evaluateSession || null,
  }));

  ctx.response.body = {
    success: true,
    data: clients,
  };
});

// 修改客户机名字
clientsRouter.put("/clients/:id", async (ctx) => {
  try {
    const id = ctx.params.id!;
    const body = await ctx.request.body.json();
    const { name } = body as { name?: string };

    if (typeof name !== "string" || name.trim() === "") {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Invalid name" };
      return;
    }

    const client = manager.clients[id];
    if (!client) {
      ctx.response.status = 404;
      ctx.response.body = { success: false, error: "Client not found" };
      return;
    }

    client.name = name.trim();

    ctx.response.body = { success: true };
  } catch (_error) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "Invalid request" };
  }
});

// 清空客户机列表
clientsRouter.post("/clients/forget", (ctx) => {
  const clearedCount = manager.clearClients();

  ctx.response.body = {
    success: true,
    data: { cleared: clearedCount },
  };
});

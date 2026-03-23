import { Router } from "@oak/oak";
import { clientManager } from "../ClientManager.ts";

/**
 * 客户端管理路由
 */
export const clientsRouter = new Router();

// 获取客户端列表
clientsRouter.get("/clients", (ctx) => {
  const clients = Object.values(clientManager.clients).map((client) => ({
    id: client.id,
    name: client.name,
    ip: client.ip,
    online: client.online,
    testSession: client.testSession || null,
    cvClient: client.cvClient || null,
    evaluateBoard: client.evaluateBoard || null,
  }));

  ctx.response.body = {
    success: true,
    data: clients,
  };
});

// 修改客户端信息（名称、CV客户端绑定）
clientsRouter.put("/clients/:id", async (ctx) => {
  try {
    const id = ctx.params.id!;
    const body = await ctx.request.body.json();
    const { name, cvClientIp } = body as { name?: string; cvClientIp?: string };

    const client = clientManager.clients[id];
    if (!client) {
      ctx.response.status = 404;
      ctx.response.body = { success: false, error: "Client not found" };
      return;
    }

    // 修改名称
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim() === "") {
        ctx.response.status = 400;
        ctx.response.body = { success: false, error: "Invalid name" };
        return;
      }
      client.name = name.trim();
    }

    // 绑定/解绑 CV 客户端
    if (cvClientIp !== undefined) {
      client.cvClient = cvClientIp
        ? { clientType: "jetson_nano", ip: cvClientIp.trim() }
        : undefined;
    }

    ctx.response.body = { success: true };
  } catch (_error) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "Invalid request" };
  }
});

// 忘记所有客户端
clientsRouter.post("/clients/forget", (ctx) => {
  clientManager.clients = {};
  const clearedCount = Object.keys(clientManager.clients).length;

  ctx.response.body = {
    success: true,
    data: { cleared: clearedCount },
  };
});

import { Hono } from "hono";
import { clientManager } from "../ClientManager.ts";

export const clientsRouter = new Hono();

// 获取客户端列表
clientsRouter.get("/", (c) => {
  const clients = Object.values(clientManager.clients).map((client) => ({
    id: client.id,
    name: client.name,
    ip: client.ip,
    online: client.online,
    testSession: client.testSession || null,
    cvClient: client.cvClient || null,
    evaluateBoard: client.evaluateBoard || null,
  }));

  return c.json({ success: true, data: clients });
});

// 修改客户端信息（名称、CV客户端绑定）
clientsRouter.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const { name, cvClientIp } = body as { name?: string; cvClientIp?: string };

    const client = clientManager.clients[id];
    if (!client) {
      return c.json({ success: false, error: "Client not found" }, 404);
    }

    // 修改名称
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim() === "") {
        return c.json({ success: false, error: "Invalid name" }, 400);
      }
      client.name = name.trim();
    }

    // 绑定/解绑 CV 客户端
    if (cvClientIp !== undefined) {
      client.cvClient = cvClientIp
        ? { clientType: "jetson_nano", ip: cvClientIp.trim() }
        : undefined;
    }

    await clientManager.persistClient(client);
    return c.json({ success: true });
  } catch (_error) {
    return c.json({ success: false, error: "Invalid request" }, 400);
  }
});

// 忘记所有客户端
clientsRouter.post("/forget", (c) => {
  clientManager.clients = {};
  return c.json({ success: true, data: { cleared: 0 } });
});

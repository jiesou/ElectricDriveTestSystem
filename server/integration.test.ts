// 集成测试 — 启动真实 Hono 服务器，用 OpiJetsonSimulator 做全链路 WebSocket 测试
import { assertEquals, assert, assertExists } from "@std/assert";
import { Hono } from "hono";
import { upgradeWebSocket } from "hono/deno";
import { OpiJetsonSimulator } from "./opi-jetson-simulator.ts";
import { ClientManager } from "./ClientManager.ts";
import { getSecondTimestamp } from "./types.ts";

// ==================== 测试辅助 ====================

function getFreePort(): number {
  const listener = Deno.listen({ port: 0, transport: "tcp" });
  const { port } = listener.addr as Deno.NetAddr;
  listener.close();
  return port;
}

function startTestServer(port: number, clientManager: ClientManager): Deno.HttpServer {
  const app = new Hono();

  app.get("/ws", upgradeWebSocket((c) => {
    const ip = c.req.header("x-forwarded-for") || "127.0.0.1";
    return {
      onOpen(_event, ws) {
        const client = clientManager.connectClient(ip, ws as unknown as WebSocket);
        ws.send(JSON.stringify({ type: "connected", clientId: client.id }));
      },
      onMessage(event, ws) {
        try {
          const message = JSON.parse(event.data as string);
          const client = Object.values(clientManager.clients).find((c) => c.ip === ip);
          if (client) {
            clientManager.processWebSocketMessageIn(client, ws as unknown as WebSocket, message);
          }
        } catch (_e) { /* 忽略解析错误 */ }
      },
      onClose() {
        const client = Object.values(clientManager.clients).find((c) => c.ip === ip);
        if (client) clientManager.disconnectClient(client);
      },
    };
  }));

  app.get("/health", (c) => c.json({ status: "ok", ts: getSecondTimestamp() }));

  return Deno.serve({ port }, app.fetch);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 连接并等待 connected 消息接收完毕（避免 handleMessage 与 waitForMessage 的竞态） */
async function connectAndWait(sim: OpiJetsonSimulator): Promise<void> {
  await sim.connect();
  await delay(200);
}

// ==================== 测试用例 ====================

Deno.test("集成测试：服务器启动并接受 WebSocket 连接", async () => {
  const mgr = new ClientManager();
  const port = getFreePort();
  const server = startTestServer(port, mgr);

  try {
    await delay(50);

    const sim = new OpiJetsonSimulator({
      wsUrl: `ws://127.0.0.1:${port}/ws`,
      reconnectDelayMs: 999_999,
    });

    await connectAndWait(sim);
    assert(sim.isConnected, "模拟器应处于已连接状态");
    assertEquals(sim.clientId.length, 36, "应分配标准 UUID clientId");

    assertEquals(Object.keys(mgr.clients).length, 1);
    const client = mgr.clients[sim.clientId];
    assertExists(client);
    assertEquals(client.online, true);
    assertEquals(client.ip, "127.0.0.1");

    sim.disconnect();
    await delay(100);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：Ping/Pong 往返正常", async () => {
  const mgr = new ClientManager();
  const port = getFreePort();
  const server = startTestServer(port, mgr);

  try {
    await delay(50);

    const sim = new OpiJetsonSimulator({
      wsUrl: `ws://127.0.0.1:${port}/ws`,
      pingIntervalMs: 200,
      reconnectDelayMs: 999_999,
    });

    await connectAndWait(sim);
    await delay(800); // 等待几次 ping/pong 往返

    assert(sim.metrics.pingsSent > 0, "应发送过 ping");
    assert(sim.metrics.pongsReceived > 0, "应收到 pong 响应");

    const client = mgr.clients[sim.clientId];
    assertExists(client.lastPing);
    assert(client.lastPing! > 0);

    sim.disconnect();
    await delay(100);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：断开连接后 ClientManager 标记离线", async () => {
  const mgr = new ClientManager();
  const port = getFreePort();
  const server = startTestServer(port, mgr);

  try {
    await delay(50);

    const sim = new OpiJetsonSimulator({
      wsUrl: `ws://127.0.0.1:${port}/ws`,
      reconnectDelayMs: 999_999,
    });

    await connectAndWait(sim);
    const clientId = sim.clientId;
    assert(mgr.clients[clientId].online, "连接时应在线");

    sim.disconnect();
    await delay(200);

    assertEquals(mgr.clients[clientId].online, false, "断线后应标记离线");
    assertEquals(mgr.clients[clientId].socket, undefined, "socket 应被清除");
    assertEquals(mgr.clients[clientId].lastPing, undefined, "lastPing 应被清除");
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：同一 IP 重连复用 clientId（会话保持）", async () => {
  const mgr = new ClientManager();
  const port = getFreePort();
  const server = startTestServer(port, mgr);

  try {
    await delay(50);

    const sim1 = new OpiJetsonSimulator({
      wsUrl: `ws://127.0.0.1:${port}/ws`,
      reconnectDelayMs: 999_999,
    });
    await connectAndWait(sim1);
    const clientId1 = sim1.clientId;
    sim1.disconnect();
    await delay(200);

    const sim2 = new OpiJetsonSimulator({
      wsUrl: `ws://127.0.0.1:${port}/ws`,
      reconnectDelayMs: 999_999,
    });
    await connectAndWait(sim2);
    const clientId2 = sim2.clientId;

    assertEquals(clientId2, clientId1, "同一 IP 重新连接应复用相同 clientId");
    assertEquals(mgr.clients[clientId2].online, true, "重连后应在线");
    assertEquals(Object.keys(mgr.clients).length, 1, "只应有一个客户端实例");

    sim2.disconnect();
    await delay(100);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：多客户机并发连接", async () => {
  const mgr = new ClientManager();
  const port = getFreePort();
  const server = startTestServer(port, mgr);

  try {
    await delay(50);

    const sims: OpiJetsonSimulator[] = [];
    for (let i = 0; i < 3; i++) {
      const sim = new OpiJetsonSimulator({
        wsUrl: `ws://127.0.0.1:${port}/ws`,
        reconnectDelayMs: 999_999,
      });
      await sim.connect();
      sims.push(sim);
    }

    for (const sim of sims) {
      assert(sim.isConnected, "每个模拟器都应连接");
    }

    for (const sim of sims) {
      sim.disconnect();
    }
    await delay(200);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：127.0.0.1 连接时 cvClient 通过 CV_CLIENT_MAP 绑定", async () => {
  const mgr = new ClientManager();
  const port = getFreePort();
  const server = startTestServer(port, mgr);

  try {
    await delay(50);

    const sim = new OpiJetsonSimulator({
      wsUrl: `ws://127.0.0.1:${port}/ws`,
      reconnectDelayMs: 999_999,
    });

    await connectAndWait(sim);
    const client = mgr.clients[sim.clientId];

    // cvClientMap.json 中 127.0.0.1 -> 192.168.11.121 jetson_nano
    assertExists(client.cvClient, "应通过 CV_CLIENT_MAP 绑定 cvClient");
    assertEquals(client.cvClient!.ip, "192.168.11.121");
    assertEquals(client.cvClient!.clientType, "jetson_nano");
    assertExists(mgr.cvClients["192.168.11.121"]);

    sim.disconnect();
    await delay(100);
  } finally {
    await server.shutdown();
  }
});

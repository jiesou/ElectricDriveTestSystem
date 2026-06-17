// 集成测试 — 启动真实 Hono 服务器（与 server.ts 一致的中间件和路由），用 OpiJetsonSimulator 做全链路 WebSocket 测试
import { assertEquals, assert, assertExists } from "@std/assert";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { upgradeWebSocket } from "hono/deno";
import { OpiJetsonSimulator } from "./opi-jetson-simulator.ts";
import { ClientManager } from "./ClientManager.ts";
import { getSecondTimestamp } from "./types.ts";
import { generatorRouter } from "./routes/generator.ts";
import { troublesRouter } from "./routes/troubles.ts";
import { questionsRouter } from "./routes/questions.ts";
import { clientsRouter } from "./routes/clients.ts";
import { testsRouter } from "./routes/tests.ts";
import { cvRouter } from "./routes/cv.ts";
import { calcWiringScore } from "./routes/cv.ts";
import "./TroubleTest.ts";
import "./EvaluateFunction.ts";
import { troubleTest } from "./TroubleTest.ts";
import { clientManager } from "./ClientManager.ts";
import { prisma } from "./prisma/client.ts";

// ==================== 测试辅助 ====================

function getFreePort(): number {
  const listener = Deno.listen({ port: 0, transport: "tcp" });
  const { port } = listener.addr as Deno.NetAddr;
  listener.close();
  return port;
}

/** 构建与 server.ts 一致的 Hono app */
function buildApp(mgr: ClientManager): Hono {
  const app = new Hono();
  app.use("*", cors());
  app.use("*", logger());

  app.get("/ws", upgradeWebSocket((c) => {
    const rawIp = c.req.header("x-forwarded-for") || c.req.header("host") || "unknown";
    const ip = rawIp.includes(":") ? rawIp.split(":")[0] : rawIp;
    return {
      onOpen(_event, ws) {
        const client = mgr.connectClient(ip, ws as unknown as WebSocket);
        ws.send(JSON.stringify({ type: "connected", clientId: client.id }));
      },
      onMessage(event, ws) {
        try {
          const message = JSON.parse(event.data as string);
          const client = Object.values(mgr.clients).find(c => c.ip === ip);
          if (client) mgr.processWebSocketMessageIn(client, ws as unknown as WebSocket, message);
        } catch (_e) { /* 忽略解析错误 */ }
      },
      onClose(_event, ws) {
        const client = Object.values(mgr.clients).find(c => c.ip === ip && c.socket === (ws as unknown as WebSocket));
        if (client) mgr.disconnectClient(client);
      },
    };
  }));

  const api = new Hono();
  api.route("/troubles", troublesRouter);
  api.route("/questions", questionsRouter);
  api.route("/clients", clientsRouter);
  api.route("/tests", testsRouter);
  api.route("/generator", generatorRouter);
  api.route("/cv", cvRouter);
  api.get("/health", (c) => c.json({ status: "ok", timestamp: getSecondTimestamp() }));

  app.route("/api", api);
  app.get("/health", (c) => c.json({ status: "ok", ts: getSecondTimestamp() }));

  app.onError((err, c) => {
    console.error("Integration test server error:", err);
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}

function startTestServer(port: number, mgr: ClientManager): Deno.HttpServer {
  return Deno.serve({ port }, buildApp(mgr).fetch);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function connectAndWait(sim: OpiJetsonSimulator): Promise<void> {
  await sim.connect();
  await delay(200);
}

/** 清理指定 clientId 的所有副作用 */
function cleanup(clientId: string) {
  delete clientManager.clients[clientId];
  // 清理关联的 cvClient（如果无其他引用）
  clientManager.cvClients = {};
  troubleTest.tests = [];
}

type TestContext = {
  port: number;
  server: Deno.HttpServer;
  sim: OpiJetsonSimulator;
  clientId: string;
};

/** 建立带有 cvClient 绑定的测试环境（127.0.0.1 → 192.168.11.121） */
async function setupWithSim(mgr: ClientManager = clientManager, ip = "127.0.0.1"): Promise<TestContext> {
  const port = getFreePort();
  const server = startTestServer(port, mgr);
  await delay(50);

  const sim = new OpiJetsonSimulator({
    wsUrl: `ws://${ip}:${port}/ws`,
    reconnectDelayMs: 999_999,
  });
  await connectAndWait(sim);

  return { port, server, sim, clientId: sim.clientId };
}

// ==================== WebSocket 基础集成测试 ====================

Deno.test("集成测试：服务器启动并接受 WebSocket 连接", async () => {
  const mgr = new ClientManager();
  const { server, sim, clientId } = await setupWithSim(mgr);

  try {
    assert(sim.isConnected, "模拟器应处于已连接状态");
    assertEquals(clientId.length, 36, "应分配标准 UUID clientId");
    const client = mgr.clients[clientId];
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
  await delay(50);

  const sim = new OpiJetsonSimulator({
    wsUrl: `ws://127.0.0.1:${port}/ws`,
    pingIntervalMs: 200,
    reconnectDelayMs: 999_999,
  });

  try {
    await connectAndWait(sim);
    await delay(800);
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
  const { server, sim, clientId } = await setupWithSim(mgr);

  try {
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
  await delay(50);

  try {
    const sim1 = new OpiJetsonSimulator({
      wsUrl: `ws://127.0.0.1:${port}/ws`,
      reconnectDelayMs: 999_999,
    });
    await connectAndWait(sim1);
    const id1 = sim1.clientId;
    sim1.disconnect();
    await delay(200);

    const sim2 = new OpiJetsonSimulator({
      wsUrl: `ws://127.0.0.1:${port}/ws`,
      reconnectDelayMs: 999_999,
    });
    await connectAndWait(sim2);
    assertEquals(sim2.clientId, id1, "同一 IP 重新连接应复用相同 clientId");
    assertEquals(mgr.clients[id1].online, true);
    assertEquals(Object.keys(mgr.clients).length, 1);
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
  await delay(50);

  try {
    const sims: OpiJetsonSimulator[] = [];
    for (let i = 0; i < 3; i++) {
      const sim = new OpiJetsonSimulator({
        wsUrl: `ws://127.0.0.1:${port}/ws`,
        reconnectDelayMs: 999_999,
      });
      await sim.connect();
      sims.push(sim);
    }
    for (const s of sims) assert(s.isConnected);
    for (const s of sims) s.disconnect();
    await delay(200);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：127.0.0.1 连接时 cvClient 通过 CV_CLIENT_MAP 绑定", async () => {
  const mgr = new ClientManager();
  const { server, sim, clientId } = await setupWithSim(mgr);

  try {
    const client = mgr.clients[clientId];
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

// ==================== HTTP→WS 交叉路径集成测试 — 使用全局 clientManager ====================

Deno.test("集成测试：HTTP创建测验 → WS推送至客户端", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    const q = await troubleTest.addQuestion({
      troubles: [{ id: 1, description: "集成测试故障", from_wire: 101, to_wire: 102 }],
    });

    const res = await fetch(`http://127.0.0.1:${port}/api/tests/test-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientIds: [clientId], questionIds: [q.id] }),
    });
    assertEquals(res.status, 200);
    const body = await res.json() as { success: boolean };
    assert(body.success);

    const pushMsg = await sim.waitForMessage(
      (m: unknown) => (m as Record<string, unknown>)?.type === "trouble_test_push",
      3000,
    );
    assertExists(pushMsg);
    const msg = pushMsg as { type: string; all_questions: unknown[] };
    assertEquals(msg.type, "trouble_test_push");
    assert(msg.all_questions.length > 0);

    const client = clientManager.clients[clientId];
    assertExists(client.testSession);

    sim.disconnect();
    await delay(100);
    await troubleTest.deleteQuestion(q.id);
    cleanup(clientId);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：排故测验完整工作流（答题→交卷→得分）", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    const q = await troubleTest.addQuestion({
      troubles: [{ id: 10, description: "故障A", from_wire: 101, to_wire: 102 }],
    });

    const res = await fetch(`http://127.0.0.1:${port}/api/tests/test-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientIds: [clientId], questionIds: [q.id] }),
    });
    assertEquals(res.status, 200);
    await sim.waitForMessage(
      (m: unknown) => (m as Record<string, unknown>)?.type === "trouble_test_push",
      3000,
    );

    const now = getSecondTimestamp();
    const updatedQuestions = [{
      id: q.id,
      troubles: [{
        id: 10, description: "故障A", from_wire: 101, to_wire: 102,
        submitted_from_wire: 103, submitted_to_wire: 104, submitted_correct: true,
      }],
    }];
    sim.send("trouble_test_update_request", {
      all_questions: updatedQuestions, start_time: now, duration_time: null,
    });
    await delay(200);

    const client = clientManager.clients[clientId];
    assertExists(client.testSession);
    assertEquals(client.testSession!.logs.filter((l) => l.action === "answer").length, 1);

    const finishTs = getSecondTimestamp() + 60;
    sim.send("trouble_test_update_request", {
      all_questions: updatedQuestions, start_time: now, duration_time: null,
      finish_time: finishTs, finished_score: 85,
    });
    await delay(200);

    assertEquals(client.testSession!.finishTime, finishTs);
    assertEquals(client.testSession!.finishedScore, 85);
    const finishLogs = client.testSession!.logs.filter((l) => l.action === "finish");
    assertEquals(finishLogs.length, 1);

    sim.disconnect();
    await delay(100);
    await troubleTest.deleteQuestion(q.id);
    const testId = client.testSession!.test.id;
    await prisma.storedTest.delete({ where: { id: BigInt(testId) } }).catch(() => {});
    troubleTest.tests = [];
    cleanup(clientId);
  } finally {
    await server.shutdown();
  }
});

// ==================== CV 路由集成测试 — 使用全局 clientManager ====================

// CV 路由通过 findClientsByCvIp(cvClientIp) 查找，cvClientIp 来自 HTTP 请求的 IP 头
// 127.0.0.1 的 client 绑定了 cvClientIp=192.168.11.121，所以 CV 请求应带 x-forwarded-for: 192.168.11.121

const CV_IP = "192.168.11.121";
const JPEG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0]);

Deno.test("集成测试：upload_wiring 返回评分结果", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    const formData = new FormData();
    formData.append("image", new Blob([JPEG], { type: "image/jpeg" }), "test.jpg");
    formData.append("result", JSON.stringify({ sleeves_num: 55, cross_num: 3, excopper_num: 1, exterminal_num: 2 }));

    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_wiring`, {
      method: "POST",
      headers: { "x-forwarded-for": CV_IP },
      body: formData,
    });
    assertEquals(res.status, 200);
    const body = await res.json() as { success: boolean; data: { sleeves_num: number } };
    assert(body.success);
    assertEquals(body.data.sleeves_num, 55);

    const cvClient = clientManager.clients[clientId]?.cvClient;
    assertExists(cvClient, "cvClient 应通过 CV_CLIENT_MAP 绑定");
    assertExists(cvClient!.session, "应创建 evaluate_wiring 会话");

    sim.disconnect();
    await delay(100);
    // 清理 cvClient session
    delete cvClient!.session;
    cleanup(clientId);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：confirm_wiring 计算并推送评分到客户端", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    const cvClient = clientManager.clients[clientId]!.cvClient!;
    cvClient.session = {
      type: "evaluate_wiring",
      startTime: getSecondTimestamp(),
      shots: [{
        timestamp: getSecondTimestamp(),
        image: "/uploads/test.jpg",
        result: { sleeves_num: 58, cross_num: 2, excopper_num: 0, exterminal_num: 1 },
      }],
    };

    const res = await fetch(`http://127.0.0.1:${port}/api/cv/confirm_wiring`, {
      method: "POST",
      headers: { "x-forwarded-for": CV_IP },
    });
    assertEquals(res.status, 200);
    const body = await res.json() as { success: boolean; data: { scores: number } };
    assert(body.success);
    assertEquals(body.data.scores, calcWiringScore(58, 2, 1));

    const pushMsg = await sim.waitForMessage(
      (m: unknown) => (m as Record<string, unknown>)?.type === "evaluate_wiring_yolo_push",
      3000,
    );
    assertExists(pushMsg);

    sim.disconnect();
    await delay(100);
    delete cvClient.session;
    cleanup(clientId);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：confirm_wiring 无会话返回错误", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/cv/confirm_wiring`, {
      method: "POST",
      headers: { "x-forwarded-for": CV_IP },
    });
    assertEquals(res.status, 400);
    const body = await res.json() as { success: boolean };
    assertEquals(body.success, false);

    sim.disconnect();
    await delay(100);
    cleanup(clientId);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：upload_face 创建签到会话并推送结果", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    const formData = new FormData();
    formData.append("image", new Blob([JPEG], { type: "image/jpeg" }), "face.jpg");
    formData.append("who", "张三");

    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_face`, {
      method: "POST",
      headers: { "x-forwarded-for": CV_IP },
      body: formData,
    });
    assertEquals(res.status, 200);
    const body = await res.json() as { success: boolean; data: { who: string } };
    assert(body.success);
    assertEquals(body.data.who, "张三");

    const pushMsg = await sim.waitForMessage(
      (m: unknown) => (m as Record<string, unknown>)?.type === "face_signin_result_push",
      3000,
    );
    assertExists(pushMsg);

    sim.disconnect();
    await delay(100);
    cleanup(clientId);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：upload_deskclean 创清洁会话并记入日志", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    const client = clientManager.clients[clientId];
    client.testSession = {
      id: `${clientId}_desk`,
      test: { id: 1, questions: [{ id: 1, troubles: [] }], startTime: getSecondTimestamp(), durationTime: null },
      logs: [],
    };

    const formData = new FormData();
    formData.append("image", new Blob([JPEG], { type: "image/jpeg" }), "desk.jpg");
    formData.append("result", JSON.stringify({ sleeves_num: 2, screwdriver_ready: true, wire_stripper_ready: true, multimeter_ready: false, crimping_ready: true, clean_progress: 0.85 }));

    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_deskclean`, {
      method: "POST",
      headers: { "x-forwarded-for": CV_IP },
      body: formData,
    });
    assertEquals(res.status, 200);
    const body = await res.json() as { success: boolean; data: { clean_progress: number } };
    assert(body.success);
    assertEquals(body.data.clean_progress, 0.85);

    const deskLogs = client.testSession!.logs.filter((l) => l.action === "desk_clean");
    assertEquals(deskLogs.length, 1);
    assertEquals(deskLogs[0].details.deskCleanResult.clean_progress, 0.85);

    sim.disconnect();
    await delay(100);
    cleanup(clientId);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：clear_session 清除 CV 客户端会话", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    const cvClient = clientManager.clients[clientId]!.cvClient!;
    cvClient.session = { type: "evaluate_wiring", startTime: getSecondTimestamp(), shots: [] };
    assertExists(cvClient.session);

    const res = await fetch(`http://127.0.0.1:${port}/api/cv/clear_session/${CV_IP}`, {
      method: "POST",
    });
    assertEquals(res.status, 200);
    assertEquals(cvClient.session, undefined);

    sim.disconnect();
    await delay(100);
    cleanup(clientId);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：pull_xiaoxin_update 返回状态", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    // 设置状态后拉取
    const cvClient = clientManager.clients[clientId]!.cvClient!;
    cvClient.xiaoxin_status = { type: "status_text_update", status_text: "排故进行时！" };

    const res = await fetch(`http://127.0.0.1:${port}/api/cv/pull_xiaoxin_update`, {
      headers: { "x-forwarded-for": CV_IP },
    });
    assertEquals(res.status, 200);
    const body = await res.json() as { success: boolean; data: { status_text: string; type: string } };
    assert(body.success);
    assertEquals(body.data.status_text, "排故进行时！");

    sim.disconnect();
    await delay(100);
    delete cvClient.xiaoxin_status;
    cleanup(clientId);
  } finally {
    await server.shutdown();
  }
});

// ==================== 持久化往返集成测试 ====================

Deno.test("集成测试：持久化往返 — 保存后恢复客户端状态（含 cvClient 绑定）", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    const client = clientManager.clients[clientId];
    client.name = "持久化测试工位";
    client.testSession = {
      id: `${clientId}_persist`,
      test: { id: 99, questions: [{ id: 99, troubles: [] }], startTime: getSecondTimestamp(), durationTime: 60 },
      logs: [],
    };
    client.evaluateBoard = {
      description: "功能评估板",
      function_steps: [{ description: "步骤1", can_wait_for_ms: 1000, waited_for_ms: 500, passed: true, finished: true }],
    };
    await clientManager.persistClient(client);

    // 模拟"重启"：清空内存，从 DB 重新加载
    const savedId = client.id;
    const savedCvIp = client.cvClient!.ip;
    clientManager.clients = {};
    clientManager.cvClients = {};

    await clientManager.loadAllClients();

    const restored = clientManager.clients[savedId];
    assertExists(restored, "客户端应被恢复");
    assertEquals(restored.name, "持久化测试工位");
    assertEquals(restored.online, false);
    assertEquals(restored.ip, "127.0.0.1");
    assertEquals(restored.testSession!.id, `${savedId}_persist`);
    assertEquals(restored.testSession!.test.durationTime, 60);
    assertEquals(restored.evaluateBoard!.function_steps[0].description, "步骤1");
    assertExists(restored.cvClient, "cvClient 应通过 cvClientIp 恢复绑定");
    assertEquals(restored.cvClient!.ip, savedCvIp);
    assertExists(clientManager.cvClients[savedCvIp], "cvClient 应在 cvClients 中");

    // 清理 DB
    await prisma.storedClient.delete({ where: { id: savedId } }).catch(() => {});
    await prisma.storedCvClient.delete({ where: { ip: savedCvIp } }).catch(() => {});
    sim.disconnect();
    await delay(100);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：持久化往返 — 多客户端共享同一个 cvClient 引用", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    const clientA = clientManager.clients[clientId];
    // 创建第二个客户端绑定同一个 cvClient
    const clientB = { ...clientA, id: crypto.randomUUID(), ip: "127.0.0.2", name: "clientB" };
    clientManager.clients[clientB.id] = clientB;

    assertEquals(clientA.cvClient, clientB.cvClient, "两个客户端应共享同一 cvClient");

    await clientManager.persistClient(clientA);
    await clientManager.persistClient(clientB);

    const idA = clientA.id;
    const idB = clientB.id;
    clientManager.clients = {};
    clientManager.cvClients = {};

    await clientManager.loadAllClients();

    const restoredA = clientManager.clients[idA];
    const restoredB = clientManager.clients[idB];
    assertExists(restoredA?.cvClient);
    assertExists(restoredB?.cvClient);
    assertEquals(restoredA!.cvClient, restoredB!.cvClient, "恢复后应共享同一个 cvClient 引用");

    // 清理 DB
    await prisma.storedClient.deleteMany({ where: { id: { in: [idA, idB] } } }).catch(() => {});
    await prisma.storedCvClient.delete({ where: { ip: "192.168.11.121" } }).catch(() => {});
    sim.disconnect();
    await delay(100);
  } finally {
    await server.shutdown();
  }
});

// ==================== 测验管理集成测试 ====================

Deno.test("集成测试：finish-all 结束所有活跃测验", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    const client = clientManager.clients[clientId];
    client.testSession = {
      id: `${clientId}_finishall`,
      test: { id: 800, questions: [{ id: 1, troubles: [] }], startTime: getSecondTimestamp(), durationTime: null },
      logs: [],
    };

    const res = await fetch(`http://127.0.0.1:${port}/api/tests/finish-all`, { method: "POST" });
    assertEquals(res.status, 200);
    assertExists(client.testSession!.finishTime);

    sim.disconnect();
    await delay(100);
    cleanup(clientId);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：clear-all 清除所有测验和会话", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    const client = clientManager.clients[clientId];
    client.testSession = {
      id: `${clientId}_clearall`,
      test: { id: 900, questions: [{ id: 1, troubles: [] }], startTime: getSecondTimestamp(), durationTime: null },
      logs: [],
    };

    const res = await fetch(`http://127.0.0.1:${port}/api/tests/clear-all`, { method: "POST" });
    assertEquals(res.status, 200);
    assertEquals(client.testSession, undefined);
    assertEquals(troubleTest.tests.length, 0);

    sim.disconnect();
    await delay(100);
    cleanup(clientId);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：relay-rainbow 广播到在线客户端并收集延迟", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/tests/relay-rainbow`, { method: "POST" });
    assertEquals(res.status, 200);
    const body = await res.json() as { success: boolean; data: { sent: number; latencies: unknown[] } };
    assert(body.success);
    assertEquals(body.data.sent, 1, "应发送到1个在线客户端");
    assertEquals(body.data.latencies.length, 1);

    sim.disconnect();
    await delay(100);
    cleanup(clientId);
  } finally {
    await server.shutdown();
  }
});

// ==================== HTTP 基础端点集成测试 ====================

Deno.test("集成测试：/health 端点返回 ok", async () => {
  const port = getFreePort();
  const server = startTestServer(port, clientManager);

  try {
    await delay(50);
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assertEquals(res.status, 200);
    assertEquals((await res.json() as { status: string }).status, "ok");

    const apiRes = await fetch(`http://127.0.0.1:${port}/api/health`);
    assertEquals(apiRes.status, 200);
    assertEquals((await apiRes.json() as { status: string }).status, "ok");
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：/api/troubles 返回故障列表", async () => {
  const port = getFreePort();
  const server = startTestServer(port, clientManager);

  try {
    await delay(50);
    const res = await fetch(`http://127.0.0.1:${port}/api/troubles`);
    assertEquals(res.status, 200);
    const body = await res.json() as { success: boolean; data: unknown[] };
    assert(body.success);
    assert(body.data.length >= 6, "至少应有6个故障类型");
  } finally {
    await server.shutdown();
  }
});

// ==================== CV 路由边缘用例集成测试 ====================

Deno.test("集成测试：upload_wiring 缺少 image 返回错误", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    const formData = new FormData();
    formData.append("not_image", "wrong field");

    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_wiring`, {
      method: "POST",
      headers: { "x-forwarded-for": CV_IP },
      body: formData,
    });
    assertEquals(res.status, 400);
    const body = await res.json() as { success: boolean; error: string };
    assertEquals(body.success, false);
    assert(body.error.includes("未上传图片"));

    sim.disconnect();
    await delay(100);
    cleanup(clientId);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：upload_wiring 非 multipart 请求返回错误", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_wiring`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": CV_IP },
      body: JSON.stringify({ image: "not-form-data" }),
    });
    assertEquals(res.status, 400);
    const body = await res.json() as { success: boolean; error: string };
    assertEquals(body.success, false);
    assert(body.error.includes("multipart"));

    sim.disconnect();
    await delay(100);
    cleanup(clientId);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：upload_face 缺少 image 返回错误", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    const formData = new FormData();
    formData.append("who", "张三");

    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_face`, {
      method: "POST",
      headers: { "x-forwarded-for": CV_IP },
      body: formData,
    });
    assertEquals(res.status, 400);
    const body = await res.json() as { success: boolean; error: string };
    assertEquals(body.success, false);
    assert(body.error.includes("未上传图片"));

    sim.disconnect();
    await delay(100);
    cleanup(clientId);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：upload_deskclean 缺少 result 返回错误", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    const formData = new FormData();
    formData.append("image", new Blob([JPEG], { type: "image/jpeg" }), "desk.jpg");

    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_deskclean`, {
      method: "POST",
      headers: { "x-forwarded-for": CV_IP },
      body: formData,
    });
    assertEquals(res.status, 400);
    const body = await res.json() as { success: boolean; error: string };
    assertEquals(body.success, false);
    assert(body.error.includes("result"));

    sim.disconnect();
    await delay(100);
    cleanup(clientId);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：upload_deskclean 非法 JSON 返回错误", async () => {
  const { port, server, sim, clientId } = await setupWithSim();

  try {
    const formData = new FormData();
    formData.append("image", new Blob([JPEG], { type: "image/jpeg" }), "desk.jpg");
    formData.append("result", "不是 JSON");

    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_deskclean`, {
      method: "POST",
      headers: { "x-forwarded-for": CV_IP },
      body: formData,
    });
    assertEquals(res.status, 400);
    const body = await res.json() as { success: boolean; error: string };
    assertEquals(body.success, false);
    assert(body.error.includes("JSON"));

    sim.disconnect();
    await delay(100);
    cleanup(clientId);
  } finally {
    await server.shutdown();
  }
});

Deno.test("集成测试：clear_session 无客户机时返回400", async () => {
  const port = getFreePort();
  // 清空全局 clientManager 确保无客户机
  const savedClients = { ...clientManager.clients };
  const savedCv = { ...clientManager.cvClients };
  clientManager.clients = {};
  clientManager.cvClients = {};
  const server = startTestServer(port, clientManager);

  try {
    await delay(50);
    const res = await fetch(`http://127.0.0.1:${port}/api/cv/clear_session/10.0.0.99`, {
      method: "POST",
    });
    assertEquals(res.status, 400);
    const body = await res.json() as { success: boolean };
    assertEquals(body.success, false);
  } finally {
    clientManager.clients = savedClients;
    clientManager.cvClients = savedCv;
    await server.shutdown();
  }
});

Deno.test("集成测试：持久化往返 — 空 DB 不丢数据", async () => {
  const port = getFreePort();
  const server = startTestServer(port, clientManager);

  try {
    await delay(50);
    const countBefore = Object.keys(clientManager.clients).length;
    await clientManager.loadAllClients();
    assertEquals(Object.keys(clientManager.clients).length, countBefore);
  } finally {
    await server.shutdown();
  }
});

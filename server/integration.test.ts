import { assertEquals, assert, assertExists } from "@std/assert";
import { OpiJetsonSimulator } from "./opi-jetson-simulator.ts";
import { getSecondTimestamp } from "./types.ts";
import { calcWiringScore } from "./routes/cv.ts";
import "./TroubleTest.ts";
import "./EvaluateFunction.ts";
import { troubleTest } from "./TroubleTest.ts";
import { clientManager } from "./ClientManager.ts";
import { prisma } from "./prisma/client.ts";
import { app } from "./server.ts";

Deno.test.beforeEach(() => {
  clientManager.clients = {};
  clientManager.cvClients = {};
  troubleTest.tests = [];
});

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function connectSim(ip: string, port: number, opts = {}): Promise<OpiJetsonSimulator> {
  const sim = new OpiJetsonSimulator({ wsUrl: `ws://${ip}:${port}/ws`, reconnectDelayMs: 999_999, ...opts });
  await sim.connect();
  await delay(200);
  return sim;
}

Deno.test("WebSocket 通信基础集成测试", async (t) => {
  const server = Deno.serve({ port: 0 }, app.fetch);
  const port = (server.addr as Deno.NetAddr).port;

  await t.step("服务器启动并接受 WebSocket 连接", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const clientId = sim.clientId;
    assert(sim.isConnected);
    assertEquals(clientId.length, 36);
    assert(clientManager.clients[clientId].online);
    sim.disconnect();
  });

  await t.step("Ping/Pong 往返正常", async () => {
    const sim = await connectSim("127.0.0.1", port, { pingIntervalMs: 200 });
    await delay(600);
    assert(sim.metrics.pingsSent > 0);
    assert(sim.metrics.pongsReceived > 0);
    const client = clientManager.clients[sim.clientId];
    assert(client.lastPing! > 0);
    sim.disconnect();
  });

  await t.step("断开连接后 ClientManager 标记离线", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const { clientId } = sim;
    sim.disconnect();
    await delay(200);
    assertEquals(clientManager.clients[clientId].online, false);
    assertEquals(clientManager.clients[clientId].socket, undefined);
    assertEquals(clientManager.clients[clientId].lastPing, undefined);
  });

  await t.step("同一 IP 重连复用 clientId", async () => {
    const sim1 = await connectSim("127.0.0.1", port);
    const id1 = sim1.clientId;
    sim1.disconnect();
    await delay(200);
    const sim2 = await connectSim("127.0.0.1", port);
    assertEquals(sim2.clientId, id1);
    assert(clientManager.clients[id1].online);
    sim2.disconnect();
  });

  await t.step("多客户机并发连接", async () => {
    const sims = await Promise.all(Array.from({ length: 3 }, () => connectSim("127.0.0.1", port)));
    for (const s of sims) assert(s.isConnected);
    for (const s of sims) s.disconnect();
  });

  await t.step("cvClient 通过 CV_CLIENT_MAP 绑定", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const client = clientManager.clients[sim.clientId];
    assert(client.cvClient?.ip === "192.168.11.121");
    assert(client.cvClient?.clientType === "jetson_nano");
    assert(clientManager.cvClients["192.168.11.121"]);
    sim.disconnect();
  });

  await server.shutdown();
});

Deno.test("HTTP→WS 交叉路径集成测试", async (t) => {
  const server = Deno.serve({ port: 0 }, app.fetch);
  const port = (server.addr as Deno.NetAddr).port;

  await t.step("HTTP创建测验 → WS推送至客户端", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const clientId = sim.clientId;

    const q = await troubleTest.addQuestion({
      troubles: [{ id: 1, description: "集成测试故障", from_wire: 101, to_wire: 102 }],
    });
    const res = await fetch(`http://127.0.0.1:${port}/api/tests/test-sessions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientIds: [clientId], questionIds: [q.id] }),
    });
    assertEquals(res.status, 200);
    const push = await sim.waitForMessage((m: any) => m?.type === "trouble_test_push", 3000) as any;
    assert(push?.all_questions?.length > 0);
    assert(clientManager.clients[clientId].testSession);

    await troubleTest.deleteQuestion(q.id);
    sim.disconnect();
  });

  await t.step("排故测验完整工作流（答题→交卷→得分）", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const clientId = sim.clientId;

    const q = await troubleTest.addQuestion({
      troubles: [{ id: 10, description: "故障A", from_wire: 101, to_wire: 102 }],
    });
    await fetch(`http://127.0.0.1:${port}/api/tests/test-sessions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientIds: [clientId], questionIds: [q.id] }),
    });
    await sim.waitForMessage((m: any) => m?.type === "trouble_test_push", 3000);

    const now = getSecondTimestamp();
    sim.send("trouble_test_update_request", {
      all_questions: [{
        id: q.id,
        troubles: [{
          id: 10, description: "故障A", from_wire: 101, to_wire: 102,
          submitted_from_wire: 103, submitted_to_wire: 104, submitted_correct: true,
        }],
      }],
      start_time: now, duration_time: null,
    });
    await delay(200);
    assertEquals(clientManager.clients[clientId].testSession!.logs.filter(l => l.action === "answer").length, 1);

    const finishTs = getSecondTimestamp() + 60;
    sim.send("trouble_test_update_request", {
      all_questions: [{ id: q.id, troubles: [] }],
      start_time: now, duration_time: null,
      finish_time: finishTs, finished_score: 85,
    });
    await delay(200);
    assertEquals(clientManager.clients[clientId].testSession!.finishTime, finishTs);
    assertEquals(clientManager.clients[clientId].testSession!.finishedScore, 85);

    const testId = clientManager.clients[clientId].testSession!.test.id;
    await troubleTest.deleteQuestion(q.id);
    await prisma.storedTest.delete({ where: { id: BigInt(testId) } }).catch(() => {});
    sim.disconnect();
  });

  await server.shutdown();
});

const CV_IP = "192.168.11.121";
const JPEG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0]);

Deno.test("CV 机器视觉路由集成测试", async (t) => {
  const server = Deno.serve({ port: 0 }, app.fetch);
  const port = (server.addr as Deno.NetAddr).port;

  await t.step("upload_wiring 返回评分结果", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const form = new FormData();
    form.append("image", new Blob([JPEG], { type: "image/jpeg" }), "test.jpg");
    form.append("result", JSON.stringify({ sleeves_num: 55, cross_num: 3, excopper_num: 1, exterminal_num: 2 }));

    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_wiring`, {
      method: "POST", headers: { "x-forwarded-for": CV_IP }, body: form,
    });
    assertEquals(res.status, 200);
    const body = await res.json() as any;
    assert(body.success);
    assertEquals(body.data.sleeves_num, 55);
    const cv = clientManager.clients[sim.clientId]?.cvClient;
    assert(cv?.session);
    delete cv?.session;
    sim.disconnect();
  });

  await t.step("confirm_wiring 计算并推送评分到客户端", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const cv = clientManager.clients[sim.clientId]!.cvClient!;
    cv.session = { type: "evaluate_wiring", startTime: getSecondTimestamp(), shots: [{ timestamp: getSecondTimestamp(), image: "/u.jpg", result: { sleeves_num: 58, cross_num: 2, excopper_num: 0, exterminal_num: 1 } }] };

    const res = await fetch(`http://127.0.0.1:${port}/api/cv/confirm_wiring`, {
      method: "POST", headers: { "x-forwarded-for": CV_IP },
    });
    assertEquals(res.status, 200);
    assertEquals((await res.json() as any).data.scores, calcWiringScore(58, 2, 1));
    const push = await sim.waitForMessage((m: any) => m?.type === "evaluate_wiring_yolo_push", 3000);
    assert(push);
    delete cv.session;
    sim.disconnect();
  });

  await t.step("confirm_wiring 无会话返回错误", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const res = await fetch(`http://127.0.0.1:${port}/api/cv/confirm_wiring`, {
      method: "POST", headers: { "x-forwarded-for": CV_IP },
    });
    assertEquals(res.status, 400);
    assertEquals((await res.json() as any).success, false);
    sim.disconnect();
  });

  await t.step("upload_face 创建签到会话并推送结果", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const form = new FormData();
    form.append("image", new Blob([JPEG], { type: "image/jpeg" }), "face.jpg");
    form.append("who", "张三");

    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_face`, {
      method: "POST", headers: { "x-forwarded-for": CV_IP }, body: form,
    });
    const body = await res.json() as any;
    assert(body.success);
    assertEquals(body.data.who, "张三");
    const push = await sim.waitForMessage((m: any) => m?.type === "face_signin_result_push", 3000);
    assert(push);
    sim.disconnect();
  });

  await t.step("upload_deskclean 创建清洁会话并记入日志", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const client = clientManager.clients[sim.clientId];
    client.testSession = { id: `${sim.clientId}_d`, test: { id: 1, questions: [{ id: 1, troubles: [] }], startTime: getSecondTimestamp(), durationTime: null }, logs: [] };

    const form = new FormData();
    form.append("image", new Blob([JPEG], { type: "image/jpeg" }), "desk.jpg");
    form.append("result", JSON.stringify({ sleeves_num: 2, screwdriver_ready: true, wire_stripper_ready: true, multimeter_ready: false, crimping_ready: true, clean_progress: 0.85 }));
    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_deskclean`, {
      method: "POST", headers: { "x-forwarded-for": CV_IP }, body: form,
    });
    assertEquals((await res.json() as any).data.clean_progress, 0.85);
    assertEquals(client.testSession!.logs.filter(l => l.action === "desk_clean").length, 1);
    sim.disconnect();
  });

  await t.step("clear_session 清除 CV 客户端会话", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const cv = clientManager.clients[sim.clientId]!.cvClient!;
    cv.session = { type: "evaluate_wiring", startTime: getSecondTimestamp(), shots: [] };

    const res = await fetch(`http://127.0.0.1:${port}/api/cv/clear_session/${CV_IP}`, { method: "POST" });
    assertEquals(res.status, 200);
    assertEquals(cv.session, undefined);
    sim.disconnect();
  });

  await t.step("pull_xiaoxin_update 返回状态", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const cv = clientManager.clients[sim.clientId]!.cvClient!;
    cv.xiaoxin_status = { type: "status_text_update", status_text: "排故进行时！" };

    const res = await fetch(`http://127.0.0.1:${port}/api/cv/pull_xiaoxin_update`, {
      headers: { "x-forwarded-for": CV_IP },
    });
    assertEquals((await res.json() as any).data.status_text, "排故进行时！");
    delete cv.xiaoxin_status;
    sim.disconnect();
  });

  await server.shutdown();
});

Deno.test("数据持久化集成测试", async (t) => {
  const server = Deno.serve({ port: 0 }, app.fetch);
  const port = (server.addr as Deno.NetAddr).port;

  await t.step("保存后恢复客户端状态", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const client = clientManager.clients[sim.clientId];
    client.name = "持久化测试工位";
    client.testSession = { id: `${sim.clientId}_p`, test: { id: 99, questions: [{ id: 99, troubles: [] }], startTime: getSecondTimestamp(), durationTime: 60 }, logs: [] };
    client.evaluateBoard = { description: "功能评估板", function_steps: [{ description: "步骤1", can_wait_for_ms: 1000, waited_for_ms: 500, passed: true, finished: true }] };
    await clientManager.persistClient(client);

    const savedId = client.id;
    const savedCvIp = client.cvClient!.ip;
    clientManager.clients = {};
    clientManager.cvClients = {};
    await clientManager.loadAllClients();

    const r = clientManager.clients[savedId];
    assert(r?.name === "持久化测试工位" && r?.online === false);
    assertEquals(r?.testSession?.test.durationTime, 60);
    assertEquals(r?.evaluateBoard?.function_steps[0].description, "步骤1");
    assertEquals(r?.cvClient?.ip, savedCvIp);

    await prisma.storedClient.delete({ where: { id: savedId } }).catch(() => {});
    await prisma.storedCvClient.delete({ where: { ip: savedCvIp } }).catch(() => {});
    sim.disconnect();
  });

  await t.step("多客户端共享同一个 cvClient 引用", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const clientA = clientManager.clients[sim.clientId];
    const clientB = { ...clientA, id: crypto.randomUUID(), ip: "127.0.0.2", name: "clientB" };
    clientManager.clients[clientB.id] = clientB;
    assertEquals(clientA.cvClient, clientB.cvClient);

    await clientManager.persistClient(clientA);
    await clientManager.persistClient(clientB);
    const idA = clientA.id, idB = clientB.id;
    clientManager.clients = {};
    clientManager.cvClients = {};
    await clientManager.loadAllClients();
    assertEquals(clientManager.clients[idA]?.cvClient, clientManager.clients[idB]?.cvClient);

    await prisma.storedClient.deleteMany({ where: { id: { in: [idA, idB] } } }).catch(() => {});
    await prisma.storedCvClient.delete({ where: { ip: "192.168.11.121" } }).catch(() => {});
    sim.disconnect();
  });

  await server.shutdown();
});

Deno.test("测验管理集成测试", async (t) => {
  const server = Deno.serve({ port: 0 }, app.fetch);
  const port = (server.addr as Deno.NetAddr).port;

  await t.step("finish-all 结束所有活跃测验", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const client = clientManager.clients[sim.clientId];
    client.testSession = { id: `${sim.clientId}_f`, test: { id: 800, questions: [{ id: 1, troubles: [] }], startTime: getSecondTimestamp(), durationTime: null }, logs: [] };
    const res = await fetch(`http://127.0.0.1:${port}/api/tests/finish-all`, { method: "POST" });
    assertEquals(res.status, 200);
    assert(client.testSession!.finishTime);
    sim.disconnect();
  });

  await t.step("clear-all 清除所有测验和会话", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const client = clientManager.clients[sim.clientId];
    client.testSession = { id: `${sim.clientId}_c`, test: { id: 900, questions: [{ id: 1, troubles: [] }], startTime: getSecondTimestamp(), durationTime: null }, logs: [] };
    const res = await fetch(`http://127.0.0.1:${port}/api/tests/clear-all`, { method: "POST" });
    assertEquals(res.status, 200);
    assertEquals(client.testSession, undefined);
    sim.disconnect();
  });

  await t.step("relay-rainbow 广播到在线客户端并收集延迟", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const res = await fetch(`http://127.0.0.1:${port}/api/tests/relay-rainbow`, { method: "POST" });
    const body = await res.json() as any;
    assertEquals(body.data.sent, 1);
    assertEquals(body.data.latencies.length, 1);
    sim.disconnect();
  });

  await server.shutdown();
});

Deno.test("CV 机器视觉路由 corner case 集成测试", async (t) => {
  const server = Deno.serve({ port: 0 }, app.fetch);
  const port = (server.addr as Deno.NetAddr).port;

  await t.step("upload_wiring 缺少 image", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const fd = new FormData(); fd.append("x", "y");
    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_wiring`, { method: "POST", headers: { "x-forwarded-for": CV_IP }, body: fd });
    assertEquals(res.status, 400);
    assert((await res.json() as any).error.includes("未上传图片"));
    sim.disconnect();
  });

  await t.step("upload_wiring 非 multipart", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_wiring`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": CV_IP }, body: JSON.stringify({}) });
    assertEquals(res.status, 400);
    assert((await res.json() as any).error.includes("multipart"));
    sim.disconnect();
  });

  await t.step("upload_face 缺少 image", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const fd = new FormData(); fd.append("who", "张三");
    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_face`, { method: "POST", headers: { "x-forwarded-for": CV_IP }, body: fd });
    assertEquals(res.status, 400);
    assert((await res.json() as any).error.includes("未上传图片"));
    sim.disconnect();
  });

  await t.step("upload_deskclean 缺少 result", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const fd = new FormData(); fd.append("image", new Blob([JPEG]));
    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_deskclean`, { method: "POST", headers: { "x-forwarded-for": CV_IP }, body: fd });
    assertEquals(res.status, 400);
    assert((await res.json() as any).error.includes("result"));
    sim.disconnect();
  });

  await t.step("upload_deskclean 非法 JSON", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const fd = new FormData(); fd.append("image", new Blob([JPEG])); fd.append("result", "不是 JSON");
    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_deskclean`, { method: "POST", headers: { "x-forwarded-for": CV_IP }, body: fd });
    assertEquals(res.status, 400);
    assert((await res.json() as any).error.includes("JSON"));
    sim.disconnect();
  });

  await server.shutdown();
});

Deno.test("集成测试：clear_session 无客户机时返回400", async () => {
  const server = Deno.serve({ port: 0 }, app.fetch);
  try {
    const res = await fetch(`http://127.0.0.1:${(server.addr as Deno.NetAddr).port}/api/cv/clear_session/10.0.0.99`, { method: "POST" });
    assertEquals(res.status, 400);
    assertEquals((await res.json() as any).success, false);
  } finally {
    await server.shutdown();
  }
});

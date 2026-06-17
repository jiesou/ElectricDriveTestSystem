import { assertEquals, assert, assertExists } from "@std/assert";
import { CvClientSimulator } from "./simulator/cvclient-simulator.ts";
import { getSecondTimestamp } from "./utils/helpers.ts";
import { calcWiringScore } from "./routes/cv.ts";
import "./routes/core/TroubleTest.ts";
import "./routes/core/EvaluateFunction.ts";
import { troubleTest } from "./routes/core/TroubleTest.ts";
import { clientManager } from "./routes/core/ClientManager.ts";
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

async function connectSim(ip: string, port: number, opts = {}): Promise<CvClientSimulator> {
  const sim = new CvClientSimulator({ wsUrl: `ws://${ip}:${port}/ws`, reconnectDelayMs: 999_999, ...opts });
  await sim.connect();
  await delay(200);
  return sim;
}

Deno.test("WebSocket 通信基础集成测试", async (t) => {
  const server = Deno.serve({ port: 0 }, app.fetch);
  const port = (server.addr as Deno.NetAddr).port;

  await t.step("连接成功：获得客户机编号，状态为在线", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const clientId = sim.clientId;
    assert(sim.isConnected);
    assertEquals(clientId.length, 36);
    assert(clientManager.clients[clientId].online);
    sim.disconnect();
  });

  await t.step("心跳Ping/Pong：仿真器定时发送ping，服务器回复pong", async () => {
    const sim = await connectSim("127.0.0.1", port, { pingIntervalMs: 200 });
    await delay(600);
    assert(sim.metrics.pingsSent > 0);
    assert(sim.metrics.pongsReceived > 0);
    const client = clientManager.clients[sim.clientId];
    assert(client.lastPing! > 0);
    sim.disconnect();
  });

  await t.step("断开连接：服务器正确标记离线、清除socket和心跳", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const { clientId } = sim;
    sim.disconnect();
    await delay(200);
    assertEquals(clientManager.clients[clientId].online, false);
    assertEquals(clientManager.clients[clientId].socket, undefined);
    assertEquals(clientManager.clients[clientId].lastPing, undefined);
  });

  await t.step("重连：同一IP地址重复连接时复用原有客户机编号", async () => {
    const sim1 = await connectSim("127.0.0.1", port);
    const id1 = sim1.clientId;
    sim1.disconnect();
    await delay(200);
    const sim2 = await connectSim("127.0.0.1", port);
    assertEquals(sim2.clientId, id1);
    assert(clientManager.clients[id1].online);
    sim2.disconnect();
  });

  await t.step("三个仿真客户机同时连接：每个连接独立WebSocket，全部在线", async () => {
    const sims = await Promise.all(Array.from({ length: 3 }, () => connectSim("127.0.0.1", port)));
    for (const s of sims) assert(s.isConnected);
    assert(Object.values(clientManager.clients).every(c => c.online));
    for (const s of sims) s.disconnect();
  });

  await t.step("WebSocket连接根据配置文件自动绑定视觉客户机", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const client = clientManager.clients[sim.clientId];
    assert(client.cvClient?.ip === "192.168.11.121");
    assert(client.cvClient?.clientType === "jetson_nano");
    assert(clientManager.cvClients["192.168.11.121"]);
    sim.disconnect();
  });

  await server.shutdown();
});

Deno.test("排故测验：HTTP创建→WebSocket推送→答题→交卷全流程", async (t) => {
  const server = Deno.serve({ port: 0 }, app.fetch);
  const port = (server.addr as Deno.NetAddr).port;

  await t.step("通过HTTP创建测验会话，客户机通过WebSocket收到试题", async () => {
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

  await t.step("完整答题流程：提交答案→交卷→服务器记录得分", async () => {
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

Deno.test("视觉机器视觉功能：拍照上传、评分推送、签到、清洁记录", async (t) => {
  const server = Deno.serve({ port: 0 }, app.fetch);
  const port = (server.addr as Deno.NetAddr).port;

  await t.step("upload_wiring 接收图片和推理结果并存储", async () => {
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

  await t.step("确认工艺评分：计算分数并通过WebSocket推送给客户机", async () => {
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

  await t.step("确认工艺评分：没有拍照时返回错误提示", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const res = await fetch(`http://127.0.0.1:${port}/api/cv/confirm_wiring`, {
      method: "POST", headers: { "x-forwarded-for": CV_IP },
    });
    assertEquals(res.status, 400);
    assertEquals((await res.json() as any).success, false);
    sim.disconnect();
  });

  await t.step("人脸签到：上传照片和姓名，客户机收到签到结果推送", async () => {
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

  await t.step("工位清洁：上传清洁结果，记入测验日志", async () => {
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

  await t.step("清除会话：视觉客户端会话被正确删除", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const cv = clientManager.clients[sim.clientId]!.cvClient!;
    cv.session = { type: "evaluate_wiring", startTime: getSecondTimestamp(), shots: [] };

    const res = await fetch(`http://127.0.0.1:${port}/api/cv/clear_session/${CV_IP}`, { method: "POST" });
    assertEquals(res.status, 200);
    assertEquals(cv.session, undefined);
    sim.disconnect();
  });

  await t.step("获取小新AI状态：返回正确的状态文本", async () => {
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

Deno.test("数据持久化：保存后恢复，客户端状态完整", async (t) => {
  const server = Deno.serve({ port: 0 }, app.fetch);
  const port = (server.addr as Deno.NetAddr).port;

  await t.step("保存并恢复：名称、测验、评估板、视觉绑定都正确还原", async () => {
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

  await t.step("多个客户机共享同一个视觉客户端引用", async () => {
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

Deno.test("测验管理：结束全部、清除全部、彩虹桥延时测量", async (t) => {
  const server = Deno.serve({ port: 0 }, app.fetch);
  const port = (server.addr as Deno.NetAddr).port;

  await t.step("结束全部测验：所有活跃测验标记完成时间", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const client = clientManager.clients[sim.clientId];
    client.testSession = { id: `${sim.clientId}_f`, test: { id: 800, questions: [{ id: 1, troubles: [] }], startTime: getSecondTimestamp(), durationTime: null }, logs: [] };
    const res = await fetch(`http://127.0.0.1:${port}/api/tests/finish-all`, { method: "POST" });
    assertEquals(res.status, 200);
    assert(client.testSession!.finishTime);
    sim.disconnect();
  });

  await t.step("清除全部测验：测验会话被清空", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const client = clientManager.clients[sim.clientId];
    client.testSession = { id: `${sim.clientId}_c`, test: { id: 900, questions: [{ id: 1, troubles: [] }], startTime: getSecondTimestamp(), durationTime: null }, logs: [] };
    const res = await fetch(`http://127.0.0.1:${port}/api/tests/clear-all`, { method: "POST" });
    assertEquals(res.status, 200);
    assertEquals(client.testSession, undefined);
    sim.disconnect();
  });

  await t.step("系统自检(继电器流水灯)：广播消息并收集客户机响应延迟", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const res = await fetch(`http://127.0.0.1:${port}/api/tests/relay-rainbow`, { method: "POST" });
    const body = await res.json() as any;
    assertEquals(body.data.sent, 1);
    assertEquals(body.data.latencies.length, 1);
    sim.disconnect();
  });

  await server.shutdown();
});

Deno.test("视觉路由：各种错误输入的处理", async (t) => {
  const server = Deno.serve({ port: 0 }, app.fetch);
  const port = (server.addr as Deno.NetAddr).port;

  await t.step("装接上传：缺少图片返回400", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const fd = new FormData(); fd.append("x", "y");
    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_wiring`, { method: "POST", headers: { "x-forwarded-for": CV_IP }, body: fd });
    assertEquals(res.status, 400);
    assert((await res.json() as any).error === "未上传图片文件");
    sim.disconnect();
  });

  await t.step("装接上传：不是multipart格式返回400", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_wiring`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": CV_IP }, body: JSON.stringify({}) });
    assertEquals(res.status, 400);
    assert((await res.json() as any).error === "必须使用 multipart/form-data");
    sim.disconnect();
  });

  await t.step("人脸签到：缺少图片返回400", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const fd = new FormData(); fd.append("who", "张三");
    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_face`, { method: "POST", headers: { "x-forwarded-for": CV_IP }, body: fd });
    assertEquals(res.status, 400);
    assert((await res.json() as any).error === "未上传图片文件");
    sim.disconnect();
  });

  await t.step("工位清洁：缺少result参数返回400", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const fd = new FormData(); fd.append("image", new Blob([JPEG]));
    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_deskclean`, { method: "POST", headers: { "x-forwarded-for": CV_IP }, body: fd });
    assertEquals(res.status, 400);
    assert((await res.json() as any).error === "需要 result 参数");
    sim.disconnect();
  });

  await t.step("工位清洁：result不是合法JSON返回400", async () => {
    const sim = await connectSim("127.0.0.1", port);
    const fd = new FormData(); fd.append("image", new Blob([JPEG])); fd.append("result", "不是 JSON");
    const res = await fetch(`http://127.0.0.1:${port}/api/cv/upload_deskclean`, { method: "POST", headers: { "x-forwarded-for": CV_IP }, body: fd });
    assertEquals(res.status, 400);
    assert((await res.json() as any).error === "result 不是合法 JSON");
    sim.disconnect();
  });

  await server.shutdown();
});

Deno.test("清除视觉会话：不存在的视觉客户机返回400", async () => {
  const server = Deno.serve({ port: 0 }, app.fetch);
  try {
    const res = await fetch(`http://127.0.0.1:${(server.addr as Deno.NetAddr).port}/api/cv/clear_session/10.0.0.99`, { method: "POST" });
    assertEquals(res.status, 400);
    assertEquals((await res.json() as any).success, false);
  } finally {
    await server.shutdown();
  }
});

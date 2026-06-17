import { assertEquals, assertExists } from "@std/assert";
import { OpiJetsonSimulator, SimulatorPool } from "./opi-jetson-simulator.ts";

Deno.test("仿真客户机 - 默认配置：未连接、无ID、测试未激活", () => {
  const sim = new OpiJetsonSimulator();
  assertEquals(sim.isConnected, false);
  assertEquals(sim.clientId, "");
  assertEquals(sim.isTestActive, false);
  assertEquals(sim.currentQuestion, 0);
  assertEquals(sim.totalQuestions, 0);
});

Deno.test("仿真客户机 - 自定义配置：传入参数不影响初始状态", () => {
  const sim = new OpiJetsonSimulator({
    pingIntervalMs: 5000,
    answerDelayMs: 200,
    alwaysCorrect: false,
  });

  assertEquals(sim.isConnected, false);
});

Deno.test("仿真客户机 - 统计指标初始值全为零", () => {
  const sim = new OpiJetsonSimulator();
  const m = sim.metrics;

  assertEquals(m.connectTime, 0);
  assertEquals(m.messagesSent, 0);
  assertEquals(m.messagesReceived, 0);
  assertEquals(m.pingsSent, 0);
  assertEquals(m.pongsReceived, 0);
  assertEquals(m.answersSent, 0);
  assertEquals(m.answersCorrect, 0);
  assertEquals(m.errors, 0);
  assertEquals(m.reconnects, 0);
});

Deno.test("仿真客户机 - 未连接时发送消息：无效操作，不计数", () => {
  const sim = new OpiJetsonSimulator();
  sim.send("ping");
  assertEquals(sim.metrics.messagesSent, 0);
});

Deno.test("仿真客户机 - 未连接时断开：安全，不报错", () => {
  const sim = new OpiJetsonSimulator();
  sim.disconnect();
  assertEquals(sim.isConnected, false);
});

Deno.test("仿真客户机 - 获取ID：未连接时返回默认值", () => {
  const sim = new OpiJetsonSimulator();
  assertEquals(sim.id, "not-connected");
});

Deno.test("仿真客户机 - 获取ID：已连接时返回客户机编号", () => {
  const sim = new OpiJetsonSimulator();
  (sim as any).clientId = "test-sim-123";
  assertEquals(sim.id, "test-sim-123");
});

Deno.test("仿真管理池 - 创建空池：可以正常使用", () => {
  const pool = new SimulatorPool();
  assertExists(pool);
  assertEquals(pool.getAll().length, 0);
});

Deno.test("仿真管理池 - 空池统计：所有指标为零", () => {
  const pool = new SimulatorPool();
  const metrics = pool.aggregateMetrics;

  assertEquals(metrics.total, 0);
  assertEquals(metrics.connected, 0);
  assertEquals(metrics.totalMessagesSent, 0);
  assertEquals(metrics.totalMessagesReceived, 0);
  assertEquals(metrics.totalErrors, 0);
  assertEquals(metrics.totalReconnects, 0);
});

Deno.test("仿真管理池 - 获取不存在的仿真器：返回undefined", () => {
  const pool = new SimulatorPool();
  const result = pool.get("nonexistent");
  assertEquals(result, undefined);
});

Deno.test("仿真管理池 - 池空时断开所有：安全，不报错", () => {
  const pool = new SimulatorPool();
  pool.disconnectAll();
  assertEquals(pool.getAll().length, 0);
});

Deno.test("仿真客户机 - 收到pong消息：计数加一", () => {
  const sim = new OpiJetsonSimulator();
  (sim as any).handleMessage({ type: "pong" });
  assertEquals(sim.metrics.pongsReceived, 1);
});

Deno.test("仿真客户机 - 收到connected消息：记录客户机编号", () => {
  const sim = new OpiJetsonSimulator();
  (sim as any).handleMessage({ type: "connected", clientId: "abc-123" });
  assertEquals(sim.clientId, "abc-123");
});

Deno.test("仿真客户机 - 已连接时发送消息：计数增加，格式正确", () => {
  const sim = new OpiJetsonSimulator();
  let sentData = "";
  (sim as any).socket = {
    send: (data: string) => { sentData = data; },
  };
  sim.isConnected = true;

  sim.send("ping");

  assertEquals(sim.metrics.messagesSent, 1);
  assertEquals(sim.metrics.pingsSent, 1);
  const parsed = JSON.parse(sentData);
  assertEquals(parsed.type, "ping");
});

Deno.test("仿真客户机 - 发送答案：计数增加", () => {
  const sim = new OpiJetsonSimulator();
  (sim as any).socket = { send: () => {} };
  sim.isConnected = true;

  sim.sendAnswer(42);

  assertEquals(sim.metrics.answersSent, 1);
});

Deno.test("仿真客户机 - 发送答案（故障编号0）：也能正常计数", () => {
  const sim = new OpiJetsonSimulator();
  (sim as any).socket = { send: () => {} };
  sim.isConnected = true;

  sim.sendAnswer(0);
  assertEquals(sim.metrics.answersSent, 1);
});

Deno.test("仿真客户机 - 结束测验：发送 finish 类型消息", () => {
  const sim = new OpiJetsonSimulator();
  let sentData = "";
  (sim as any).socket = {
    send: (data: string) => { sentData = data; },
  };
  sim.isConnected = true;

  sim.finishTest();
  const parsed = JSON.parse(sentData);
  assertEquals(parsed.type, "finish");
});

Deno.test("仿真客户机 - 回复彩虹桥：发送 ack_relay_rainbow", () => {
  const sim = new OpiJetsonSimulator();
  let sentData = "";
  (sim as any).socket = {
    send: (data: string) => { sentData = data; },
  };
  sim.isConnected = true;

  sim.ackRelayRainbow();
  const parsed = JSON.parse(sentData);
  assertEquals(parsed.type, "ack_relay_rainbow");
});

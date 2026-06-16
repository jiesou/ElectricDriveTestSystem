import { assertEquals, assertExists } from "@std/assert";
import { OpiJetsonSimulator, SimulatorPool } from "./opi-jetson-simulator.ts";

Deno.test("OpiJetsonSimulator constructor sets default config", () => {
  const sim = new OpiJetsonSimulator();
  assertEquals(sim.isConnected, false);
  assertEquals(sim.clientId, "");
  assertEquals(sim.isTestActive, false);
  assertEquals(sim.currentQuestion, 0);
  assertEquals(sim.totalQuestions, 0);
});

Deno.test("OpiJetsonSimulator custom config overrides defaults", () => {
  const sim = new OpiJetsonSimulator({
    pingIntervalMs: 5000,
    answerDelayMs: 200,
    alwaysCorrect: false,
  });

  // Can't access private config directly, but can verify behavior
  assertEquals(sim.isConnected, false);
});

Deno.test("SimulatorMetrics initial values are zero", () => {
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

Deno.test("OpiJetsonSimulator send does nothing when not connected", () => {
  const sim = new OpiJetsonSimulator();
  // Should not throw
  sim.send("ping");
  assertEquals(sim.metrics.messagesSent, 0);
});

Deno.test("OpiJetsonSimulator disconnect does nothing when not connected", () => {
  const sim = new OpiJetsonSimulator();
  // Should not throw
  sim.disconnect();
  assertEquals(sim.isConnected, false);
});

Deno.test("OpiJetsonSimulator id returns default when not connected", () => {
  const sim = new OpiJetsonSimulator();
  assertEquals(sim.id, "not-connected");
});

Deno.test("OpiJetsonSimulator id returns clientId when connected", () => {
  const sim = new OpiJetsonSimulator();
  const fakeClientId = "test-sim-123";
  // Manually set id as if connected
  (sim as any).clientId = fakeClientId;
  assertEquals(sim.id, fakeClientId);
});

Deno.test("SimulatorPool can be instantiated", () => {
  const pool = new SimulatorPool();
  assertExists(pool);
  assertEquals(pool.getAll().length, 0);
});

Deno.test("SimulatorPool aggregateMetrics returns zeros when empty", () => {
  const pool = new SimulatorPool();
  const metrics = pool.aggregateMetrics;

  assertEquals(metrics.total, 0);
  assertEquals(metrics.connected, 0);
  assertEquals(metrics.totalMessagesSent, 0);
  assertEquals(metrics.totalMessagesReceived, 0);
  assertEquals(metrics.totalErrors, 0);
  assertEquals(metrics.totalReconnects, 0);
});

Deno.test("SimulatorPool get returns undefined for unknown id", () => {
  const pool = new SimulatorPool();
  const result = pool.get("nonexistent");
  assertEquals(result, undefined);
});

Deno.test("SimulatorPool disconnectAll is safe when empty", () => {
  const pool = new SimulatorPool();
  // Should not throw
  pool.disconnectAll();
  assertEquals(pool.getAll().length, 0);
});

Deno.test("handleMessage processes 'pong' and increments counter", () => {
  const sim = new OpiJetsonSimulator();

  (sim as any).handleMessage({ type: "pong" });

  assertEquals(sim.metrics.pongsReceived, 1);
});

Deno.test("handleMessage processes 'connected' and sets clientId", () => {
  const sim = new OpiJetsonSimulator();

  (sim as any).handleMessage({ type: "connected", clientId: "abc-123" });

  assertEquals(sim.clientId, "abc-123");
});

Deno.test("send increments messagesSent with connected socket", () => {
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

Deno.test("sendAnswer increments answersSent", () => {
  const sim = new OpiJetsonSimulator();
  (sim as any).socket = { send: () => {} };
  sim.isConnected = true;

  sim.sendAnswer(42);

  assertEquals(sim.metrics.answersSent, 1);
});

Deno.test("sendAnswer with 0 trouble id", () => {
  const sim = new OpiJetsonSimulator();
  (sim as any).socket = { send: () => {} };
  sim.isConnected = true;

  sim.sendAnswer(0);
  assertEquals(sim.metrics.answersSent, 1);
});

Deno.test("finishTest sends finish type", () => {
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

Deno.test("ackRelayRainbow sends ack_relay_rainbow", () => {
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

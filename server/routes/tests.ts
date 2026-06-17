import { Hono } from "hono";
import { troubleTest } from "./core/TroubleTest.ts";
import { clientManager } from "./core/ClientManager.ts";
import { getSecondTimestamp } from "../utils/helpers.ts";

export const testsRouter = new Hono();

// 获取测验列表
testsRouter.get("/", (c) => {
  return c.json({ success: true, data: troubleTest.tests });
});

// 结束所有测验
testsRouter.post("/finish-all", (c) => {
  const finishTime = getSecondTimestamp();
  for (const client of Object.values(clientManager.clients)) {
    troubleTest.finishTest(client, finishTime);
  }

  return c.json({ success: true });
});

// 清除所有测验
testsRouter.post("/clear-all", (c) => {
  for (const client of Object.values(clientManager.clients)) {
    client.testSession = undefined;
  }
  troubleTest.tests = [];

  return c.json({ success: true });
});

// 强制下发当前测验到指定/全部客户端
testsRouter.post("/push-latest", async (c) => {
  try {
    const body = await c.req.json();
    const targetClientIds: string[] | undefined = Array.isArray(body?.clientIds)
      ? body.clientIds
      : undefined;

    const allClients = Object.values(clientManager.clients);
    const targetClients = (targetClientIds && targetClientIds.length > 0)
      ? targetClientIds
          .map((id) => clientManager.clients[id])
          .filter((client) => Boolean(client))
      : allClients;

    const results: {
      clientId: string;
      clientName: string;
      pushed: boolean;
      reason?: string;
    }[] = [];

    for (const client of targetClients) {
      if (!client?.testSession?.test) {
        results.push({
          clientId: client?.id ?? "",
          clientName: client?.name ?? "unknown",
          pushed: false,
          reason: "无测验会话",
        });
        continue;
      }

      troubleTest.pushTestToClient(client, client.testSession.test);
      results.push({
        clientId: client.id,
        clientName: client.name,
        pushed: true,
      });
    }

    return c.json({
      success: true,
      data: {
        total: results.length,
        successCount: results.filter((r) => r.pushed).length,
        results,
      },
    });
  } catch (error) {
    console.error("/tests/push-latest failed", error);
    return c.json({ success: false, error: "强制推送失败" }, 400);
  }
});

// 创建测验会话
testsRouter.post("/test-sessions", async (c) => {
  try {
    const body = await c.req.json();
    const { clientIds, questionIds, startTime, durationTime } = body;

    if (!Array.isArray(clientIds) || !Array.isArray(questionIds)) {
      return c.json({
        success: false,
        error: "Invalid clientIds or questionIds",
      }, 400);
    }

    // 查找所含的题目，同时确保保持输入的顺序
    const allQuestions = troubleTest.questions;
    const selectedQuestions = questionIds
      .map((id) => allQuestions.find((q) => q.id === id))
      .filter((q) => q !== undefined);

    if (selectedQuestions.length !== questionIds.length) {
      return c.json({ success: false, error: "Some questions not found" }, 400);
    }

    // 创建测验
    const test = await troubleTest.createTest(
      selectedQuestions,
      startTime || getSecondTimestamp(),
      durationTime || null,
    );

    // 为每个客户端创建测验会话
    const results: { clientId: string }[] = [];

    for (const clientId of clientIds) {
      const client = clientManager.clients[clientId];
      if (!client) {
        results.push({ clientId });
        continue;
      }
      troubleTest.createTestSession(client, test);
      results.push({ clientId });
    }

    return c.json({ success: true, data: results });
  } catch (_error) {
    return c.json({ success: false, error: "Invalid test-sessions create request body" }, 400);
  }
});

// 继电器功能测试（系统自检）广播 - 等待响应并返回延迟
testsRouter.post("/relay-rainbow", async (c) => {
  const sentMs = Date.now(); // 使用毫秒级时间戳
  // 为每个在线客户端创建 Promise
  const clientPromises: Promise<{
    clientId: string;
    clientName: string;
    latencyMs: number | null;
    timeout: boolean;
  }>[] = [];

  for (const client of Object.values(clientManager.clients)) {
    if (!client.online) continue;
    if (!client.socket) continue;
    if (!(client.socket.readyState === WebSocket.OPEN)) continue;

    // 记录发送时间戳到客户端（毫秒）
    client.relayRainbowSentMs = sentMs;

    // 创建 Promise 等待响应
    const clientPromise = new Promise<{
      clientId: string;
      clientName: string;
      latencyMs: number | null;
      timeout: boolean;
    }>((resolve) => {
      // 设置回调函数
      clientManager.relayRainbowCallbacks.set(client.id, (latencyMs: number) => {
        resolve({
          clientId: client.id,
          clientName: client.name,
          latencyMs,
          timeout: false,
        });
      });

      // 设置3秒超时
      setTimeout(() => {
        // 如果还没响应，清除回调并解析为超时
        if (clientManager.relayRainbowCallbacks.has(client.id)) {
          clientManager.relayRainbowCallbacks.delete(client.id);
          delete client.relayRainbowSentMs;
          resolve({
            clientId: client.id,
            clientName: client.name,
            latencyMs: null,
            timeout: true,
          });
        }
      }, 3000);
    });

    clientPromises.push(clientPromise);
  }

  // 发送 relay_rainbow 消息给所有客户端
  let sent = 0;
  for (const client of Object.values(clientManager.clients)) {
    if (!client.online) continue;
    if (!client.socket) continue;
    if (!(client.socket.readyState === WebSocket.OPEN)) continue;
    if (!client.relayRainbowSentMs) continue; // 只发送给有时间戳的客户端

    try {
      client.socket.send(
        JSON.stringify({ type: "relay_rainbow", timestamp: Math.floor(sentMs / 1000) }),
      );
      sent++;
    } catch (error) {
      console.error(`Failed to send relay_rainbow to client ${client.id}:`, error);
      // 如果发送失败，清除回调和时间戳
      clientManager.relayRainbowCallbacks.delete(client.id);
      delete client.relayRainbowSentMs;
    }
  }

  // 等待所有客户端响应或超时
  const latencies = await Promise.all(clientPromises);

  return c.json({
    success: true,
    data: { sent, latencies },
  });
});

import { Router } from "@oak/oak";
import { manager } from "../TestSystemManager.ts";
import { clientManager } from "../ClientManager.ts";
import { getSecondTimestamp } from "../types.ts";

/**
 * 测验管理路由
 */
export const testsRouter = new Router();

// 获取测验列表
testsRouter.get("/tests", (ctx) => {
  ctx.response.body = {
    success: true,
    data: manager.tests,
  };
});

// 结束所有测验
testsRouter.post("/tests/finish-all", (ctx) => {
  const finishTime = getSecondTimestamp();
  for (const client of Object.values(clientManager.clients)) {
    manager.finishTest(client, finishTime);
  }

  ctx.response.body = { success: true };
});

// 清除所有测验
testsRouter.post("/tests/clear-all", (ctx) => {
  for (const client of Object.values(clientManager.clients)) {
    client.testSession = undefined;
  }
  manager.tests = [];

  ctx.response.body = { success: true };
});

// 创建测验会话
testsRouter.post("/test-sessions", async (ctx) => {
  try {
    const body = await ctx.request.body.json();
    const { clientIds, questionIds, startTime, durationTime } = body;

    if (!Array.isArray(clientIds) || !Array.isArray(questionIds)) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Invalid clientIds or questionIds",
      };
      return;
    }

    const allQuestions = manager.questions;
    // 查找所含的题目，同时确保保持输入的顺序
    const selectedQuestions = questionIds
      .map((id) => allQuestions.find((q) => q.id === id))
      .filter((q) => q !== undefined);

    if (selectedQuestions.length !== questionIds.length) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Some questions not found" };
      return;
    }

    // 创建测验
    const test = manager.createTest(
      selectedQuestions,
      startTime || getSecondTimestamp(),
      durationTime || null,
    );

    const results: { clientId: string; success: boolean }[] = [];

    // 为每个客户端创建测验会话
    for (const clientId of clientIds) {
      const success = manager.createTestSession(clientId, test);
      results.push({ clientId, success });
    }

    ctx.response.body = {
      success: true,
      data: results,
    };
  } catch (_error) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "Invalid request body" };
  }
});

// 继电器功能测试广播
testsRouter.post("/relay-rainbow", (ctx) => {
  let sent = 0;
  for (const client of Object.values(clientManager.clients)) {
    if (!client.online) continue;
    if (!client.socket) continue;
    if (!(client.socket.readyState === WebSocket.OPEN)) continue;

    try {
      client.socket.send(
        JSON.stringify({ type: "relay_rainbow", timestamp: getSecondTimestamp() }),
      );
      sent++;
    } catch (error) {
      console.error(`Failed to send relay_rainbow to client ${client.id}:`, error);
    }
  }

  ctx.response.body = { success: true, data: { sent } };
});

// 获取系统状态
testsRouter.get("/status", (ctx) => {
  const clients = Object.values(clientManager.clients);

  ctx.response.body = {
    success: true,
    data: {
      timestamp: getSecondTimestamp(),
      connectedClients: clients.filter((c) => c.online).length,
      activeTests: clients.filter((c) => c.testSession).length,
      totalQuestions: manager.questions.length,
      totalTroubles: manager.getTroubles().length,
    },
  };
});

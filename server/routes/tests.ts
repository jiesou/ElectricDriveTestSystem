import { Router } from "@oak/oak";
import { manager } from "../TestSystemManager.ts";
import { clientManager } from "../ClientManager.ts";
import { getSecondTimestamp } from "../types.ts";

/**
 * 测验管理路由
 */
export const testsRouter = new Router( { prefix: "/tests" } );

// 获取测验列表
testsRouter.get("/", (ctx) => {
  ctx.response.body = {
    success: true,
    data: manager.tests,
  };
});

// 结束所有测验
testsRouter.post("/finish-all", (ctx) => {
  const finishTime = getSecondTimestamp();
  for (const client of Object.values(clientManager.clients)) {
    manager.finishTest(client, finishTime);
  }

  ctx.response.body = { success: true };
});

// 清除所有测验
testsRouter.post("/clear-all", (ctx) => {
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

// 继电器功能测试（系统自检）广播
// 继电器功能测试（系统自检）广播 - 等待响应并返回延迟
testsRouter.post("/relay-rainbow", async (ctx) => {
  const sentMs = Date.now(); // 使用毫秒级时间戳
  const clientsToTest: { id: string; name: string; socket: WebSocket }[] = [];
  
  // 收集所有在线的客户端
  for (const client of Object.values(clientManager.clients)) {
    if (!client.online) continue;
    if (!client.socket) continue;
    if (!(client.socket.readyState === WebSocket.OPEN)) continue;
    
    clientsToTest.push({
      id: client.id,
      name: client.name,
      socket: client.socket,
    });
    
    // 记录发送时间戳到客户端（毫秒）
    client.relayRainbowSentMs = sentMs;
  }
  
  // 发送 relay_rainbow 消息给所有客户端
  let sent = 0;
  for (const client of clientsToTest) {
    try {
      client.socket.send(
        JSON.stringify({ type: "relay_rainbow", timestamp: Math.floor(sentMs / 1000) }),
      );
      sent++;
    } catch (error) {
      console.error(`Failed to send relay_rainbow to client ${client.id}:`, error);
      // 如果发送失败，从 clientManager 中清除时间戳
      const fullClient = clientManager.clients[client.id];
      if (fullClient) {
        delete fullClient.relayRainbowSentMs;
      }
    }
  }
  
  // 等待最多3秒以收集所有响应
  const timeout = 3000; // 3秒超时
  const startWait = Date.now();
  
  while (Date.now() - startWait < timeout) {
    // 检查是否所有客户端都已响应
    let allResponded = true;
    for (const testClient of clientsToTest) {
      const client = clientManager.clients[testClient.id];
      if (client && client.relayRainbowSentMs !== undefined) {
        allResponded = false;
        break;
      }
    }
    
    if (allResponded) {
      break; // 所有客户端都已响应
    }
    
    // 等待50ms后再检查
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  // 收集延迟结果
  const latencies = clientsToTest.map(testClient => {
    const client = clientManager.clients[testClient.id];
    if (!client) {
      return null;
    }
    
    // 如果还有 relayRainbowSentMs，说明超时未响应
    if (client.relayRainbowSentMs !== undefined) {
      delete client.relayRainbowSentMs;
      return {
        clientId: testClient.id,
        clientName: testClient.name,
        latencyMs: null, // 超时
        timeout: true,
      };
    }
    
    // 从临时存储中获取延迟（在 ack 处理时设置）
    const latencyMs = (client as any)._tempLatencyMs;
    delete (client as any)._tempLatencyMs;
    
    return {
      clientId: testClient.id,
      clientName: testClient.name,
      latencyMs: latencyMs ?? null,
      timeout: false,
    };
  }).filter(item => item !== null);
  
  ctx.response.body = {
    success: true,
    data: {
      sent,
      latencies,
    },
  };
});

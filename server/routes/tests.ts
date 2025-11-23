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
  const clientPromises: Promise<{
    clientId: string;
    clientName: string;
    latencyMs: number | null;
    timeout: boolean;
  }>[] = [];
  
  // 为每个在线客户端创建 Promise
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
  
  ctx.response.body = {
    success: true,
    data: {
      sent,
      latencies,
    },
  };
});

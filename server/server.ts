import { Application, Router } from "@oak/oak";
import {
  Client,
  getSecondTimestamp,
  AnswerResultMessage,
  FinishResultMessage,
  TROUBLES,
  EvaluateWiringSession,
  FaceSigninSession,
  EvaluateFunctionBoardUpdateMessage,
  EvaluateBoard,
} from "./types.ts";
import { manager } from "./TestSystemManager.ts";
import { clientManager } from "./ClientManager.ts";
import { generatorRouter } from "./generator.ts";
import { troublesRouter } from "./routes/troubles.ts";
import { questionsRouter } from "./routes/questions.ts";
import { clientsRouter } from "./routes/clients.ts";
import { testsRouter } from "./routes/tests.ts";
import { cvRouter } from "./routes/cv.ts";
import { udpCameraServer } from "./UdpCameraServer.ts";

const app = new Application();

// Error handling middleware
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error("Server error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// CORS middleware
app.use(async (ctx, next) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "*");
  ctx.response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  ctx.response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );

  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204;
    return;
  }

  await next();
});

// WebSocket route
const wsRouter = new Router();
wsRouter.get("/ws", (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.throw(400, "Connection is not upgradable to WebSocket");
    return;
  }

  const { socket, response } = Deno.upgradeWebSocket(ctx.request.source!, {
    idleTimeout: 60, // ping 超时时间，单位秒
  });
  const clientIp = ctx.request.ip;
  const client = clientManager.connectClient(clientIp, socket);

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data as string);
      console.log("Received message:", message);

      // 处理应用层ping消息
      if (message && typeof message.type === "string" && message.type === "ping") {
        clientManager.handlePing(client, socket);
        return;
      }

      handleWebSocketMessage(client, socket, message);
    } catch (error) {
      console.error(`Error parsing message from ${client.id}:`, error);
    }
  };

  socket.onerror = (error) => {
    console.error(`WebSocket error for ${client.id}:`, error);
    clientManager.disconnectClient(client);
  };

  console.log(`WebSocket connection established for client ${client.id}`);
  ctx.response.with(response);
});

// API routes
const apiRouter = new Router({ prefix: "/api" });

// 注册各个子路由
apiRouter.use(troublesRouter.routes());
apiRouter.use(troublesRouter.allowedMethods());

apiRouter.use(questionsRouter.routes());
apiRouter.use(questionsRouter.allowedMethods());

apiRouter.use(clientsRouter.routes());
apiRouter.use(clientsRouter.allowedMethods());

apiRouter.use(testsRouter.routes());
apiRouter.use(testsRouter.allowedMethods());

apiRouter.use(generatorRouter.routes());
apiRouter.use(generatorRouter.allowedMethods());

apiRouter.use(cvRouter.routes());
apiRouter.use(cvRouter.allowedMethods());

// Health check
const healthRouter = new Router();
healthRouter.get("/health", (ctx) => {
  ctx.response.body = { status: "ok", timestamp: getSecondTimestamp() };
});

// logging middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(
    `${ctx.request.method} ${ctx.request.url} - ${ctx.response.status} - ${ms}ms`,
  );
});

// 注册路由
app.use(wsRouter.routes());
app.use(apiRouter.routes());
app.use(apiRouter.allowedMethods());
app.use(healthRouter.routes());

// 静态文件服务
app.use(async (ctx, next) => {
  const pathname = ctx.request.url.pathname;
  if (!pathname.startsWith("/api") && !pathname.startsWith("/ws")) {
    try {
      await ctx.send({
        root: "./public",
        path: pathname,
        index: "index.html",
      });
    } catch {
      // 文件不存在时，也返回 index.html (SPA fallback)
      await ctx.send({
        root: "./public",
        path: "/index.html",
      });
    }
  } else {
    await next();
  }
});

/**
 * 处理WebSocket消息
 */
function handleWebSocketMessage(
  client: Client,
  socket: WebSocket,
  message: Record<string, unknown>,
) {
  console.log(`Message from ${client.id}:`, message);

  switch (message.type) {
    case "answer": {
      // 处理答题
      const troubleId = message.trouble_id as number;
      if (!client.testSession) {
        clientManager.safeSend(socket, {
          type: "error",
          message: "No active test session",
          timestamp: getSecondTimestamp(),
        });
        return;
      }
      const trouble = TROUBLES.find((t) => t.id === troubleId);
      if (!trouble) {
        clientManager.safeSend(socket, {
          type: "error",
          message: "Trouble not found",
          timestamp: getSecondTimestamp(),
        });
        return;
      }
      const isCorrect = manager.handleAnswer(client, trouble);
      clientManager.safeSend(socket, {
        type: "answer_result",
        timestamp: getSecondTimestamp(),
        result: isCorrect,
        trouble,
      } as AnswerResultMessage);
      break;
    }

    case "next_question":
    case "last_question": {
      // 处理题目导航
      const direction = message.type === "next_question" ? "next" : "prev";
      manager.navigateQuestion(client, direction);
      break;
    }

    case "finish": {
      // 排故测验 完成
      const timestamp = typeof message.timestamp === "number"
        ? message.timestamp
        : undefined;

      const finishedScore = manager.finishTest(client, timestamp);
      clientManager.safeSend(socket, {
        type: "finish_result",
        finished_score: finishedScore,
        timestamp: getSecondTimestamp(),
      } as FinishResultMessage);
      break;
    }

    case "evaluate_function_board_update": {
      // 装接评估-功能部分 步骤更新
      const msg = message as EvaluateFunctionBoardUpdateMessage;
      
      const board: EvaluateBoard = {
        description: msg.description,
        function_steps: msg.function_steps
      };
      
      client.evaluateBoard = board;
      
      console.log(
        `[WebSocket] Updated evaluate board for client ${client.id}: ${board.description}, steps: ${board.function_steps.length}`,
      );
      
      break;
    }

    case "evaluate_wiring_yolo_request": {
      // 处理装接评估请求
      if (!client.cvClient) {
        clientManager.safeSend(socket, {
          type: "error",
          message: "No CV client configured",
          timestamp: getSecondTimestamp(),
        });
        return;
      }

      // 创建装接评估会话
      const session: EvaluateWiringSession = {
        type: "evaluate_wiring",
        startTime: getSecondTimestamp(),
        shots: [],
      };
      client.cvClient.session = session;

      console.log(
        `[WebSocket] Started evaluate_wiring session for client ${client.id}`,
      );

      // 通知CV客户端开始拍照/推理
      // 实际的CV客户端交互通过HTTP POST到 /api/cv/upload_wiring 实现
      break;
    }

    case "face_signin_request": {
      // 处理人脸签到请求
      if (!client.cvClient) {
        clientManager.safeSend(socket, {
          type: "error",
          message: "No CV client configured",
          timestamp: getSecondTimestamp(),
        });
        return;
      }

      // 创建人脸签到会话
      const session: FaceSigninSession = {
        type: "face_signin",
        startTime: getSecondTimestamp(),
      };
      client.cvClient.session = session;

      console.log(
        `[WebSocket] Started face_signin session for client ${client.id}`,
      );

      // 通知CV客户端开始人脸识别
      // 实际的CV客户端交互通过HTTP POST到 /api/cv/upload_face 实现
      break;
    }

    case "ack_relay_rainbow": {
      // 处理 relay_rainbow 的 ack 响应，计算延迟
      if (!client.relayRainbowSentMs) {
        console.warn(
          `[WebSocket] Received ack_relay_rainbow from ${client.id} but no sent timestamp recorded`,
        );
        return;
      }

      const nowMs = Date.now();
      const latencyMs = nowMs - client.relayRainbowSentMs;
      
      console.log(
        `[WebSocket] Relay rainbow latency for client ${client.id}: ${latencyMs}ms`,
      );

      // 清除发送时间戳（表示已响应）
      delete client.relayRainbowSentMs;

      // 调用回调函数（如果存在）
      const callback = clientManager.relayRainbowCallbacks.get(client.id);
      if (callback) {
        callback(latencyMs);
        clientManager.relayRainbowCallbacks.delete(client.id);
      }
      break;
    }

    default:
      console.warn(`Unknown message type: ${message.type}`);
  }
}

// 处理应用错误
app.addEventListener("error", (evt) => {
  console.log("Application error:", evt.error?.message || "Unknown");
});

console.log("Server starting on port 8000");
console.log("WebSocket endpoint: ws://localhost:8000/ws");
console.log("API endpoint: http://localhost:8000/api");

// 启动 UDP 图传接收器
udpCameraServer.start(8000);

await app.listen({ port: 8000 });

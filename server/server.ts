import { Application, Router } from "@oak/oak";
import {
  AnswerResultMessage,
  Client,
  EvaluateBoard,
  EvaluateFunctionBoardUpdateMessage,
  EvaluateWiringSession,
  FaceSigninSession,
  FinishResultMessage,
  getSecondTimestamp,
  TROUBLES,
} from "./types.ts";
import { manager } from "./TestSystemManager.ts";
import { clientManager } from "./ClientManager.ts";
import "./tests.ts"; // 注册排故测验消息处理器
import "./evaluate.ts"; // 注册装接评估消息处理器
import { generatorRouter } from "./routes/generator.ts";
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
    const message = JSON.parse(event.data as string);
    console.log("Received message:", message);

    // 处理应用层 ping 消息
    if (
      message && typeof message.type === "string" && message.type === "ping"
    ) {
      client.lastPing = getSecondTimestamp();
      client.online = true;
      client.socket = socket;
      clientManager.safeSend(socket, {
        type: "pong",
        timestamp: getSecondTimestamp(),
      });
      return;
    }

    // 仅在 socket.onmessage 中调用 processWebSocketMessage
    clientManager.processWebSocketMessage(client, socket, message);
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
  if (ctx.request.url.pathname === "/api/clients") return; // 忽略该路由的日志
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

// WebSocket 消息处理逻辑已拆分到独立模块（server/tests.ts 和 server/evaluate.ts），
// 这些模块在 server 启动时通过 clientManager.addOnMessageHandler 注册各自的处理器。
// 保留这里作为占位注释，避免删除过多代码。

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

import { Application, Router } from "@oak/oak";
import { getSecondTimestamp } from "./types.ts";
import { manager } from "./TestSystemManager.ts";
import { generatorRouter } from "./generator.ts";
import { wsManager } from "./websocket/manager.ts";
import { handleWebSocketMessage } from "./websocket/handler.ts";
import { troublesRouter } from "./routes/troubles.ts";
import { questionsRouter } from "./routes/questions.ts";
import { clientsRouter } from "./routes/clients.ts";
import { testsRouter } from "./routes/tests.ts";
import { cvRouter } from "./routes/cv.ts";
import { statusRouter } from "./routes/status.ts";

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
  const client = wsManager.connectClient(clientIp, socket, manager.clients);
  
  // 将新连接的客户端添加到 manager
  if (!manager.clients[client.id]) {
    manager.clients[client.id] = client;
  }

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data as string);
      console.log("Received message:", message);
      
      // handle application-level ping: update lastPing timestamp
      if (message && typeof message.type === "string" && message.type === "ping") {
        wsManager.handlePing(client, socket);
        return;
      }

      handleWebSocketMessage(client, socket, message);
    } catch (error) {
      console.error(`Error parsing message from ${client.id}:`, error);
    }
  };

  socket.onerror = (error) => {
    console.error(`WebSocket error for ${client.id}:`, error);
    wsManager.disconnectClient(client);
  };

  console.log(`WebSocket connection established for client ${client.id}`);
  ctx.response.with(response);
});

// API routes - 使用模块化路由
const apiRouter = new Router({ prefix: "/api" });

// 注册各个功能模块的路由
apiRouter.use(troublesRouter.routes());
apiRouter.use(troublesRouter.allowedMethods());

apiRouter.use(questionsRouter.routes());
apiRouter.use(questionsRouter.allowedMethods());

apiRouter.use(clientsRouter.routes());
apiRouter.use(clientsRouter.allowedMethods());

apiRouter.use(testsRouter.routes());
apiRouter.use(testsRouter.allowedMethods());

apiRouter.use(cvRouter.routes());
apiRouter.use(cvRouter.allowedMethods());

apiRouter.use(statusRouter.routes());
apiRouter.use(statusRouter.allowedMethods());

// Generator 路由
apiRouter.use(generatorRouter.routes());
apiRouter.use(generatorRouter.allowedMethods());

// Register routes
app.use(async (ctx, next) => {
  const pathname = ctx.request.url.pathname;
  if (!pathname.startsWith("/api") && !pathname.startsWith("/ws")) {
    await ctx.send({
      root: "./public",
      path: pathname,
      index: "index.html",
    });
  } else {
    await next();
  }
});
app.use(wsRouter.routes());
app.use(apiRouter.routes());
app.use(apiRouter.allowedMethods());

// Handle application errors silently
app.addEventListener("error", (evt) => {
  console.log("Application error:", evt.error?.message || "Unknown");
});

console.log("Server starting on port 8000");
console.log("WebSocket endpoint: ws://localhost:8000/ws");
console.log("API endpoint: http://localhost:8000/api");

await app.listen({ port: 8000 });

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/deno";
import { upgradeWebSocket } from "hono/deno";
import { logger } from "hono/logger";
import { getSecondTimestamp, WSMessage } from "./types.ts";
import { clientManager } from "./ClientManager.ts";
import { initSystem } from "./SystemManager.ts";
import "./TroubleTest.ts"; // 注册排故测验 WSMessageHandler
import "./EvaluateFunction.ts"; // 注册装接评估 WSMessageHandler
import { generatorRouter } from "./routes/generator.ts";
import { troublesRouter } from "./routes/troubles.ts";
import { questionsRouter } from "./routes/questions.ts";
import { clientsRouter } from "./routes/clients.ts";
import { testsRouter } from "./routes/tests.ts";
import { cvRouter } from "./routes/cv.ts";
import { udpCameraServer } from "./UdpCameraServer.ts";

const app = new Hono();

app.use("*", cors());
app.use("*", logger());

// WebSocket route
app.get("/ws", upgradeWebSocket((c) => {
  const ip = c.req.header("x-forwarded-for") || c.req.header("host") || "unknown";
  return {
    onOpen(_event, ws) {
      const client = clientManager.connectClient(ip, ws as unknown as WebSocket);
      console.log(`WebSocket connection established for client ${client.name}`);
    },
    onMessage(event, ws) {
      try {
        const message: WSMessage = JSON.parse(event.data as string);
        console.log("Received message:", message);
        const client = Object.values(clientManager.clients).find(c => c.ip === ip);
        if (client) {
          clientManager.processWebSocketMessageIn(client, ws as unknown as WebSocket, message);
        }
      } catch (e) {
        console.error("WS message error:", e);
      }
    },
    onClose(_event, ws) {
      const client = Object.values(clientManager.clients).find(c => c.ip === ip && c.socket === (ws as unknown as WebSocket));
      if (client) {
        clientManager.disconnectClient(client);
      }
    },
    onError(_event, ws) {
      const client = Object.values(clientManager.clients).find(c => c.ip === ip);
      if (client) {
        console.error(`WebSocket error for ${client.name}`);
      }
    },
  };
}));

// 注册各个子路由
const api = new Hono();
api.route("/troubles", troublesRouter);
api.route("/questions", questionsRouter);
api.route("/clients", clientsRouter);
api.route("/tests", testsRouter);
api.route("/generator", generatorRouter);
api.route("/cv", cvRouter);

// Health check
api.get("/health", (c) => c.json({ status: "ok", timestamp: getSecondTimestamp() }));

app.route("/api", api);

// 静态文件服务（客户端上传的资源）
app.use("/uploads/*", serveStatic({ root: "./data" }));
// 静态文件服务（前端）
app.use("/*", serveStatic({ root: "./public" }));
// 文件不存在时，也返回 index.html (SPA fallback)
app.get("/*", serveStatic({ path: "./public/index.html" }));

// 处理应用错误
app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// WebSocket 消息处理逻辑已拆分到独立模块（TroubleTest.ts 和 EvaluateFunction.ts），
// 这些模块在 server 启动时通过 clientManager.addWSMessageHandler 注册各自的处理器。
async function main() {
  await initSystem();
  clientManager.startHeartbeat();
  // 启动 UDP 图传接收器
  udpCameraServer.start(8000);

  console.log("Server starting on port 8000");
  console.log("WebSocket endpoint: ws://localhost:8000/ws");
  console.log("API endpoint: http://localhost:8000/api");

  Deno.serve({ port: 8000 }, app.fetch);
}

main();

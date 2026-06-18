import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/deno";
import { upgradeWebSocket } from "hono/deno";
import { logger } from "hono/logger";
import { WSMessage } from "./types.ts";
import { getClientIP, getSecondTimestamp } from "./utils/helpers.ts";
import { clientManager } from "./routes/core/ClientManager.ts";
import "./routes/core/TroubleTest.ts";
import "./routes/core/EvaluateFunction.ts";
import { generatorRouter } from "./routes/generator.ts";
import { troublesRouter } from "./routes/troubles.ts";
import { questionsRouter } from "./routes/questions.ts";
import { clientsRouter } from "./routes/clients.ts";
import { testsRouter } from "./routes/tests.ts";
import { cvRouter } from "./routes/cv.ts";

export const app = new Hono();
app.use("*", cors());
app.use("*", logger());

app.get(
  "/ws",
  upgradeWebSocket((c) => {
    const ip = getClientIP(c);
    return {
      onOpen(_event, ws) {
        const client = clientManager.connectClient(
          ip,
          ws as unknown as WebSocket,
        );
        ws.send(JSON.stringify({ type: "connected", clientId: client.id }));
        console.log(
          `WebSocket connection established for client ${client.name}`,
        );
      },
      onMessage(event, ws) {
        try {
          const message: WSMessage = JSON.parse(event.data as string);
          console.log("Received message:", message);
          const client = Object.values(clientManager.clients).find((c) =>
            c.ip === ip
          );
          if (client) {
            clientManager.processWebSocketMessageIn(
              client,
              ws as unknown as WebSocket,
              message,
            );
          }
        } catch (e) {
          console.error("WS message error:", e);
        }
      },
      onClose(_event, ws) {
        const client = Object.values(clientManager.clients).find((c) =>
          c.ip === ip && c.socket === (ws as unknown as WebSocket)
        );
        if (client) {
          clientManager.disconnectClient(client);
        }
      },
      onError(_event, _ws) {
        const client = Object.values(clientManager.clients).find((c) =>
          c.ip === ip
        );
        if (client) {
          console.error(`WebSocket error for ${client.name}`);
          clientManager.disconnectClient(client);
        }
      },
    };
  }),
);

const api = new Hono();
api.route("/troubles", troublesRouter);
api.route("/questions", questionsRouter);
api.route("/clients", clientsRouter);
api.route("/tests", testsRouter);
api.route("/generator", generatorRouter);
api.route("/cv", cvRouter);
api.get(
  "/health",
  (c) => c.json({ status: "ok", timestamp: getSecondTimestamp() }),
);

app.route("/api", api);

app.use("/uploads/*", serveStatic({ root: "./data" }));
app.use("/*", serveStatic({ root: "./public" }));
app.get("/*", serveStatic({ path: "./public/index.html" }));

app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

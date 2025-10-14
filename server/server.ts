import { Application, Router } from "@oak/oak";
import { Client, getSecondTimestamp, AnswerResultMessage, FinishResultMessage } from "./types.ts";
import { TestSystemManager } from "./TestSystemManager.ts";

const app = new Application();
const manager = new TestSystemManager();

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
    idleTimeout: 6, // ping 超时时间，单位秒
  });
  const clientIp = ctx.request.ip;
  const client = manager.connectClient(clientIp, socket);
  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data as string);
      console.log("Received message:", message);
      handleWebSocketMessage(manager, client, socket, message);
    } catch (error) {
      console.error(`Error parsing message from ${client}:`, error);
    }
  };

  // socket.onclose = () => {
  //   manager.disconnectClient(clientId);
  // };

  socket.onerror = (error) => {
    console.error(`WebSocket error for ${client}:`, error);
    manager.disconnectClient(client);
  };

  console.log(`WebSocket connection established for client ${client}`);
  ctx.response.with(response);
});

// API routes
const apiRouter = new Router({ prefix: "/api" });

apiRouter.get("/troubles", (ctx) => {
  ctx.response.body = {
    success: true,
    data: manager.getTroubles(),
  };
});

apiRouter.get("/questions", (ctx) => {
  ctx.response.body = {
    success: true,
    data: manager.questions,
  };
});

apiRouter.post("/questions", async (ctx) => {
  try {
    const body = await ctx.request.body.json();
    const { troubles } = body;

    if (!Array.isArray(troubles) || troubles.length === 0) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Invalid troubles array" };
      return;
    }

    const newQuestion = manager.addQuestion({ troubles });
    ctx.response.body = {
      success: true,
      data: newQuestion,
    };
  } catch (_error) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "Invalid request body" };
  }
});

apiRouter.put("/questions/:id", async (ctx) => {
  try {
    const id = parseInt(ctx.params.id!);
    const body = await ctx.request.body.json();
    const success = manager.updateQuestion(id, body);

    if (success) {
      ctx.response.body = { success: true };
    } else {
      ctx.response.status = 404;
      ctx.response.body = { success: false, error: "Question not found" };
    }
  } catch (_error) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "Invalid request" };
  }
});

apiRouter.delete("/questions/:id", (ctx) => {
  const id = parseInt(ctx.params.id!);
  const success = manager.deleteQuestion(id);

  if (success) {
    ctx.response.body = { success: true };
  } else {
    ctx.response.status = 404;
    ctx.response.body = { success: false, error: "Question not found" };
  }
});

apiRouter.get("/clients", (ctx) => {
  const clients = Object.values(manager.clients).map((client) => ({
    id: client.id,
    name: client.name,
    ip: client.ip,
    online: client.online,
    testSession: client.testSession || null,
  }));

  ctx.response.body = {
    success: true,
    data: clients,
  };
});

apiRouter.post("/clients/forget", (ctx) => {
  const clearedCount = manager.clearClients();

  ctx.response.body = {
    success: true,
    data: { cleared: clearedCount },
  };
});

apiRouter.get("/tests", (ctx) => {
  ctx.response.body = {
    success: true,
    data: manager.tests,
  };
});

apiRouter.post("/tests/finish-all", (ctx) => {
  const finishTime = getSecondTimestamp();
  for (const client of Object.values(manager.clients)) {
    manager.finishTest(client, finishTime);
  }

  ctx.response.body = { success: true };
});

apiRouter.post("/tests/clear-all", (ctx) => {
  for (const client of Object.values(manager.clients)) {
    client.testSession = undefined;
  }
  manager.tests = [];

  ctx.response.body = { success: true };
});

// Create Test session
apiRouter.post("/test-sessions", async (ctx) => {
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

    // Create a test first
    const test = manager.createTest(
      selectedQuestions,
      startTime || getSecondTimestamp(),
      durationTime || null,
    );

    const results: { clientId: string; success: boolean }[] = [];

    // Create test sessions for each client
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

apiRouter.get("/status", (ctx) => {
  const clients = Object.values(manager.clients);

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

// Health check
const healthRouter = new Router();
healthRouter.get("/health", (ctx) => {
  ctx.response.body = { status: "ok", timestamp: getSecondTimestamp() };
});

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
app.use(healthRouter.routes());

// Helper function to safely send WebSocket messages
function safeSend(socket: WebSocket, message: Record<string, unknown>) {
  if (socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify(message));
    } catch (error) {
      console.error("Failed to send WebSocket message:", error);
    }
  }
}

function handleWebSocketMessage(
  manager: TestSystemManager,
  client: Client,
  socket: WebSocket,
  message: Record<string, unknown>,
) {
  console.log(`Message from ${client}:`, message);

  switch (message.type) {
    case "answer": {
      // find the trouble object in the current question by id
      const troubleId = message.trouble_id as number;
      if (!client.testSession) {
        safeSend(socket, {
          type: "error",
          message: "No active test session",
          timestamp: getSecondTimestamp(),
        });
        return;
      }
      const currentQuestion =
        client.testSession.test
          .questions[client.testSession.currentQuestionIndex];
      const trouble = currentQuestion.troubles.find((t) => t.id === troubleId);
      if (!trouble) {
        safeSend(socket, {
          type: "error",
          message: "Trouble not found",
          timestamp: getSecondTimestamp(),
        });
        return;
      }
      const isCorrect = manager.handleAnswer(client, trouble);
      safeSend(socket, {
        type: "answer_result",
        timestamp: getSecondTimestamp(),
        result: isCorrect,
        trouble,
      } as AnswerResultMessage);
      break;
    }

    case "next_question":
    case "last_question": {
      const direction = message.type === "next_question" ? "next" : "prev";
      manager.navigateQuestion(client, direction);
      break;
    }

    case "finish": {
      const timestamp = typeof message.timestamp === "number"
        ? message.timestamp
        : undefined;
      manager.finishTest(client, timestamp); // 使用客户机传来的时间戳（如果有）标记结束时间
      safeSend(socket, {
        type: "finish_result",
        timestamp: getSecondTimestamp(),
      } as FinishResultMessage);
      break;
    }
  }
}

// Handle application errors silently
app.addEventListener("error", (evt) => {
  console.log("Application error:", evt.error?.message || "Unknown");
});

console.log("Server starting on port 8000");
console.log("WebSocket endpoint: ws://localhost:8000/ws");
console.log("API endpoint: http://localhost:8000/api");

await app.listen({ port: 8000 });

import { Application, Router } from "@oak/oak";
import { TestSystemManager } from "./types.ts";

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
  ctx.response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204;
    return;
  }
  
  await next();
});

// WebSocket route
const wsRouter = new Router();
wsRouter.get("/ws", async (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.throw(400, "Connection is not upgradable to WebSocket");
    return;
  }

  const socket = await ctx.upgrade();
  const clientId = crypto.randomUUID();
  const clientIp = "127.0.0.1"; // Simplified for testing

  manager.addClient(clientId, clientIp, socket);

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data as string);
      handleWebSocketMessage(manager, clientId, socket, message);
    } catch (error) {
      console.error(`Error parsing message from ${clientId}:`, error);
    }
  };

  socket.onclose = () => {
    manager.removeClient(clientId);
  };

  socket.onerror = (error) => {
    console.error(`WebSocket error for ${clientId}:`, error);
    manager.removeClient(clientId);
  };

  console.log(`WebSocket connection established for client ${clientId}`);
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
    data: manager.getQuestions(),
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
  } catch (error) {
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
  } catch (error) {
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
  const clients = manager.getConnectedClients().map(client => ({
    id: client.id,
    ip: client.ip,
    session: client.session ? {
      currentQuestion: client.session.currentQuestionIndex + 1,
      totalQuestions: client.session.questions.length,
      remainingTroubles: client.session.remainingTroubles,
      startTime: client.session.startTime,
    } : null,
  }));

  ctx.response.body = {
    success: true,
    data: clients,
  };
});

// Test sessions endpoint
apiRouter.post("/test-sessions", async (ctx) => {
  try {
    const body = await ctx.request.body.json();
    const { clientIds, questionIds, startTime } = body;

    if (!Array.isArray(clientIds) || !Array.isArray(questionIds)) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Invalid clientIds or questionIds" };
      return;
    }

    const allQuestions = manager.getQuestions();
    const selectedQuestions = allQuestions.filter(q => questionIds.includes(q.id));

    if (selectedQuestions.length !== questionIds.length) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Some questions not found" };
      return;
    }

    const results: { clientId: string; success: boolean }[] = [];

    for (const clientId of clientIds) {
      const success = manager.createTestSession(clientId, selectedQuestions, startTime || Date.now() / 1000);
      results.push({ clientId, success });
    }

    ctx.response.body = {
      success: true,
      data: results,
    };
  } catch (error) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "Invalid request body" };
  }
});

apiRouter.get("/status", (ctx) => {
  const clients = manager.getConnectedClients();
  
  ctx.response.body = {
    success: true,
    data: {
      timestamp: Date.now() / 1000,
      connectedClients: clients.length,
      activeTests: clients.filter(c => c.session).length,
      totalQuestions: manager.getQuestions().length,
      totalTroubles: manager.getTroubles().length,
    },
  };
});

// Health check
const healthRouter = new Router();
healthRouter.get("/health", (ctx) => {
  ctx.response.body = { status: "ok", timestamp: Date.now() / 1000 };
});

// Register routes
app.use(wsRouter.routes());
app.use(apiRouter.routes());
app.use(apiRouter.allowedMethods());
app.use(healthRouter.routes());

// Helper function to safely send WebSocket messages
function safeSend(socket: WebSocket, message: any) {
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
  clientId: string, 
  socket: WebSocket, 
  message: any
) {
  console.log(`Message from ${clientId}:`, message);

  switch (message.type) {
    case "answer":
      const isCorrect = manager.handleAnswer(clientId, message.trouble_id);
      safeSend(socket, {
        type: "answer_result",
        result: isCorrect,
        trouble_id: message.trouble_id,
        timestamp: Date.now() / 1000,
      });
      break;
    
    case "next_question":
    case "last_question":
      const direction = message.type === "next_question" ? "next" : "prev";
      const success = manager.navigateQuestion(clientId, direction);
      safeSend(socket, {
        type: "navigation_result",
        success,
        direction: message.type === "next_question" ? "next_question" : "last_question",
        timestamp: Date.now() / 1000,
      });
      break;
    
    case "ping":
      safeSend(socket, { type: "pong", timestamp: Date.now() / 1000 });
      break;
      break;
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
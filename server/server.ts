import { Application, Router } from "@oak/oak";
import { TestSystemManager, getSecondTimestamp } from "./types.ts";

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
  const clientIp = ctx.request.ip;

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
    data: manager.questions,
  };
});

// Remove question management endpoints as per requirements
// Direct access to manager.questions property should be used instead

apiRouter.get("/clients", (ctx) => {
  const clients = manager.getClients().map(client => ({
    id: client.id,
    name: client.name,
    ip: client.ip,
    testSession: client.testSession ? {
      id: client.testSession.id,
      currentQuestion: client.testSession.currentQuestionIndex + 1,
      totalQuestions: client.testSession.test.questions.length,
      startTime: client.testSession.test.startTime,
      finishTime: client.testSession.finishTime,
      durationTime: client.testSession.test.durationTime,
      logs: client.testSession.logs
    } : null,
  }));

  ctx.response.body = {
    success: true,
    data: clients,
  };
});

// Create Test session - updated for new architecture
apiRouter.post("/test-sessions", async (ctx) => {
  try {
    const body = await ctx.request.body.json();
    const { clientIds, questionIds, startTime, durationTime } = body;

    if (!Array.isArray(clientIds) || !Array.isArray(questionIds)) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Invalid clientIds or questionIds" };
      return;
    }

    const allQuestions = manager.questions;
    const selectedQuestions = allQuestions.filter(q => questionIds.includes(q.id));

    if (selectedQuestions.length !== questionIds.length) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Some questions not found" };
      return;
    }

    // Create a test first
    const test = manager.createTest(selectedQuestions, startTime || getSecondTimestamp(), durationTime || null);
    
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
  } catch (error) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "Invalid request body" };
  }
});

// Get test sessions - updated for new architecture
apiRouter.get("/test-sessions", (ctx) => {
  const clients = manager.getClients();
  const sessions = clients.filter(c => c.testSession).map(client => ({
    sessionId: client.testSession!.id,
    clientId: client.id,
    clientIp: client.ip,
    questionIds: client.testSession!.test.questions.map(q => q.id),
    startTime: client.testSession!.test.startTime,
    durationTime: client.testSession!.test.durationTime,
    finishTime: client.testSession!.finishTime,
    currentQuestionIndex: client.testSession!.currentQuestionIndex,
    totalQuestions: client.testSession!.test.questions.length,
    logs: client.testSession!.logs
  }));

  ctx.response.body = {
    success: true,
    data: sessions,
  };
});

apiRouter.get("/status", (ctx) => {
  const clients = manager.getClients();
  
  ctx.response.body = {
    success: true,
    data: {
      timestamp: getSecondTimestamp(),
      connectedClients: clients.length,
      activeTests: clients.filter(c => c.testSession).length,
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
    case "answer": {
      // Extract trouble from message - expect trouble object now, not just ID
      const trouble = message.trouble || { id: message.trouble_id, description: "" };
      
      const isCorrect = manager.handleAnswer(clientId, trouble);
      safeSend(socket, {
        type: "answer_result",
        result: isCorrect,
        trouble: trouble,
        timestamp: getSecondTimestamp(),
      });
      break;
    }
    
    case "next_question":
    case "last_question": {
      const direction = message.type === "next_question" ? "next" : "prev";
      const success = manager.navigateQuestion(clientId, direction);
      safeSend(socket, {
        type: "navigation_result",
        success,
        direction: message.type === "next_question" ? "next_question" : "last_question",
        timestamp: getSecondTimestamp(),
      });
      break;
    }
    
    case "finish": {
      const success = manager.finishTest(clientId, message.timestamp);
      safeSend(socket, {
        type: "finish_result",
        success,
        timestamp: getSecondTimestamp(),
      });
      break;
    }
    
    case "ping": {
      safeSend(socket, { type: "pong", timestamp: getSecondTimestamp() });
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
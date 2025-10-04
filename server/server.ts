import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { Client, getSecondTimestamp } from "./types.ts";
import { TestSystemManager } from "./TestSystemManager.ts";

const app = new Hono();
const manager = new TestSystemManager();

// Logger middleware
app.use(logger());

// CORS middleware
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Error handling
app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// WebSocket route - using native Deno.upgradeWebSocket to preserve idleTimeout
app.get("/ws", (c) => {
  const upgradeHeader = c.req.header("upgrade");
  if (!upgradeHeader || upgradeHeader !== "websocket") {
    return c.json({ error: "Connection is not upgradable to WebSocket" }, 400);
  }

  const { socket, response } = Deno.upgradeWebSocket(c.req.raw, {
    idleTimeout: 3, // ping 超时时间，单位秒
  });
  
  const clientIp = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
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

  socket.onerror = (error) => {
    console.error(`WebSocket error for ${client}:`, error);
    manager.disconnectClient(client);
  };

  console.log(`WebSocket connection established for client ${client}`);
  return response;
});

// API routes
const api = new Hono();

api.get("/troubles", (c) => {
  return c.json({
    success: true,
    data: manager.getTroubles(),
  });
});

api.get("/questions", (c) => {
  return c.json({
    success: true,
    data: manager.questions,
  });
});

api.post("/questions", async (c) => {
  try {
    const body = await c.req.json();
    const { troubles } = body;

    if (!Array.isArray(troubles) || troubles.length === 0) {
      return c.json({ success: false, error: "Invalid troubles array" }, 400);
    }

    const newQuestion = manager.addQuestion({ troubles });
    return c.json({
      success: true,
      data: newQuestion,
    });
  } catch (_error) {
    return c.json({ success: false, error: "Invalid request body" }, 400);
  }
});

api.put("/questions/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const success = manager.updateQuestion(id, body);

    if (success) {
      return c.json({ success: true });
    } else {
      return c.json({ success: false, error: "Question not found" }, 404);
    }
  } catch (_error) {
    return c.json({ success: false, error: "Invalid request" }, 400);
  }
});

api.delete("/questions/:id", (c) => {
  const id = parseInt(c.req.param("id"));
  const success = manager.deleteQuestion(id);

  if (success) {
    return c.json({ success: true });
  } else {
    return c.json({ success: false, error: "Question not found" }, 404);
  }
});

api.get("/clients", (c) => {
  const clients = Object.values(manager.clients).map((client) => ({
    id: client.id,
    name: client.name,
    ip: client.ip,
    online: client.online,
    testSession: client.testSession || null,
  }));

  return c.json({
    success: true,
    data: clients,
  });
});

api.get("/tests", (c) => {
  return c.json({
    success: true,
    data: manager.getTests(),
  });
});

// Create Test session
api.post("/test-sessions", async (c) => {
  try {
    const body = await c.req.json();
    const { clientIds, questionIds, startTime, durationTime } = body;

    if (!Array.isArray(clientIds) || !Array.isArray(questionIds)) {
      return c.json({ success: false, error: "Invalid clientIds or questionIds" }, 400);
    }

    const allQuestions = manager.questions;
    const selectedQuestions = allQuestions.filter(q => questionIds.includes(q.id));

    if (selectedQuestions.length !== questionIds.length) {
      return c.json({ success: false, error: "Some questions not found" }, 400);
    }

    // Create a test first
    const test = manager.createTest(selectedQuestions, startTime || getSecondTimestamp(), durationTime || null);
    
    const results: { clientId: string; success: boolean }[] = [];

    // Create test sessions for each client
    for (const clientId of clientIds) {
      const success = manager.createTestSession(clientId, test);
      results.push({ clientId, success });
    }

    return c.json({
      success: true,
      data: results,
    });
  } catch (_error) {
    return c.json({ success: false, error: "Invalid request body" }, 400);
  }
});

// Get test sessions - updated for new architecture
api.get("/test-sessions", (c) => {
  const clients = Object.values(manager.clients);
  const sessions = clients.filter((c) => c.testSession).map((client) => ({
    sessionId: client.testSession!.id,
    clientId: client.id,
    clientIp: client.ip,
    questionIds: client.testSession!.test.questions.map((q) => q.id),
    startTime: client.testSession!.test.startTime,
    durationTime: client.testSession!.test.durationTime,
    finishTime: client.testSession!.finishTime,
    currentQuestionIndex: client.testSession!.currentQuestionIndex,
    totalQuestions: client.testSession!.test.questions.length,
    logs: client.testSession!.logs
  }));

  return c.json({
    success: true,
    data: sessions,
  });
});

api.get("/status", (c) => {
  const clients = Object.values(manager.clients);
  
  return c.json({
    success: true,
    data: {
      timestamp: getSecondTimestamp(),
      connectedClients: clients.filter((c) => c.online).length,
      activeTests: clients.filter((c) => c.testSession).length,
      totalQuestions: manager.questions.length,
      totalTroubles: manager.getTroubles().length,
    },
  });
});

// Mount API routes under /api prefix
app.route("/api", api);

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: getSecondTimestamp() });
});

// Static file serving (optional - only if public directory exists)
// Note: Hono doesn't handle static files by default, but since the original
// code tried to serve from ./public, we'll skip it if the directory doesn't exist

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
  message: Record<string, unknown>
) {
  console.log(`Message from ${client}:`, message);

  switch (message.type) {
    case "answer": {
      // find the trouble object in the current question by id
      const troubleId = message.trouble_id as number;
      if (!client.testSession) {
        safeSend(socket, { type: "error", message: "No active test session", timestamp: getSecondTimestamp() });
        return;
      }
      const currentQuestion = client.testSession.test.questions[client.testSession.currentQuestionIndex];
      const trouble = currentQuestion.troubles.find(t => t.id === troubleId);
      if (!trouble) {
        safeSend(socket, { type: "error", message: "Trouble not found", timestamp: getSecondTimestamp() });
        return;
      }
      const isCorrect = manager.handleAnswer(client, trouble);
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
      const success = manager.navigateQuestion(client, direction);
      safeSend(socket, {
        type: "navigation_result",
        success,
        direction: message.type === "next_question" ? "next_question" : "last_question",
        timestamp: getSecondTimestamp(),
      });
      break;
    }
    
    case "finish": {
      const timestamp = typeof message.timestamp === 'number' ? message.timestamp : undefined;
      const success = manager.finishTest(client, timestamp);
      safeSend(socket, {
        type: "finish_result",
        success,
        timestamp: getSecondTimestamp(),
      });
      break;
    }
  }
}

console.log("Server starting on port 8000");
console.log("WebSocket endpoint: ws://localhost:8000/ws");
console.log("API endpoint: http://localhost:8000/api");

Deno.serve({ port: 8000 }, app.fetch);
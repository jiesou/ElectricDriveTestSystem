import { Hono, cors } from "./hono-compat.ts";
import { Client, getSecondTimestamp } from "./types.ts";
import { TestSystemManager } from "./TestSystemManager.ts";

const app = new Hono();
const manager = new TestSystemManager();

// CORS middleware
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Error handling middleware
app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// WebSocket route - using Deno native WebSocket
app.get("/ws", (c) => {
  const upgrade = c.req.header("upgrade");
  if (upgrade !== "websocket") {
    return c.text("Expected websocket", 400);
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
app.get("/api/troubles", (c) => {
  return c.json({
    success: true,
    data: manager.getTroubles(),
  });
});

app.get("/api/questions", (c) => {
  return c.json({
    success: true,
    data: manager.questions,
  });
});

app.post("/api/questions", async (c) => {
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

app.put("/api/questions/:id", async (c) => {
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

app.delete("/api/questions/:id", (c) => {
  const id = parseInt(c.req.param("id"));
  const success = manager.deleteQuestion(id);

  if (success) {
    return c.json({ success: true });
  } else {
    return c.json({ success: false, error: "Question not found" }, 404);
  }
});

app.get("/api/clients", (c) => {
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

app.get("/api/tests", (c) => {
  return c.json({
    success: true,
    data: manager.getTests(),
  });
});

app.post("/api/test-sessions", async (c) => {
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

    const test = manager.createTest(selectedQuestions, startTime || getSecondTimestamp(), durationTime || null);
    
    const results: { clientId: string; success: boolean }[] = [];

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

app.get("/api/test-sessions", (c) => {
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

app.get("/api/status", (c) => {
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

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: getSecondTimestamp() });
});

// Static file serving fallback
app.get("*", async (c) => {
  const pathname = new URL(c.req.url).pathname;
  
  if (pathname.startsWith("/api") || pathname.startsWith("/ws")) {
    return c.notFound();
  }
  
  try {
    const filePath = pathname === "/" ? "/index.html" : pathname;
    const file = await Deno.readFile(`./public${filePath}`);
    const ext = filePath.split(".").pop();
    const contentType = ext === "html" ? "text/html" : 
                       ext === "js" ? "application/javascript" :
                       ext === "css" ? "text/css" : "text/plain";
    return c.body(file, 200, { "Content-Type": contentType });
  } catch {
    try {
      const indexFile = await Deno.readFile("./public/index.html");
      return c.html(new TextDecoder().decode(indexFile));
    } catch {
      return c.notFound();
    }
  }
});

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
      const success = manager.navigateQuestion(client.id, direction);
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
      const success = manager.finishTest(client.id, timestamp);
      safeSend(socket, {
        type: "finish_result",
        success,
        timestamp: getSecondTimestamp(),
      });
      break;
    }
  }
}

// Start the server
console.log("Server starting on port 8000");
console.log("WebSocket endpoint: ws://localhost:8000/ws");
console.log("API endpoint: http://localhost:8000/api");

Deno.serve({ port: 8000 }, app.fetch);
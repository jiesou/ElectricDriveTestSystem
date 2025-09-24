import { Application, Router } from "@oak/oak";

// Types for the system
export interface Fault {
  id: number;
  description: string;
}

export interface Question {
  id: string;
  faults: number[]; // Array of fault IDs that should be active
}

export interface Test {
  id: string;
  questions: Question[];
  startTime: number; // Unix timestamp
}

export interface Client {
  id: string;
  ip: string;
  socket: WebSocket;
  currentTest?: string;
  currentQuestion?: number;
  answers: { questionId: string; answeredFaults: number[]; timestamp: number }[];
  logs: string[];
}

export interface TestSession {
  testId: string;
  clients: string[]; // Client IDs
  currentQuestionIndex: number;
  startTime: number;
  status: 'pending' | 'active' | 'completed';
}

// Global state
const clients = new Map<string, Client>();
const faults: Fault[] = [
  { id: 1, description: "101 和 102 断路" },
  { id: 2, description: "102 和 103 断路" },
  { id: 3, description: "103 和 104 断路" },
  { id: 4, description: "电机绕组故障" },
  { id: 5, description: "启动电容故障" },
];
const tests = new Map<string, Test>();
const testSessions = new Map<string, TestSession>();

// Utility functions
export function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

// WebSocket message handling
function handleWebSocketMessage(client: Client, data: any) {
  try {
    const message = JSON.parse(data);
    console.log(`Client ${client.id} sent:`, message);
    
    switch (message.type) {
      case 'client_info':
        client.logs.push(`${getCurrentTimestamp()}: Client info received`);
        // Send current state if in test
        if (client.currentTest) {
          sendCurrentTestState(client);
        }
        break;
        
      case 'answer':
        handleAnswer(client, message.faultId);
        break;
        
      default:
        console.log('Unknown message type:', message.type);
    }
  } catch (error) {
    console.error('Error parsing WebSocket message:', error);
  }
}

function handleAnswer(client: Client, faultId: number) {
  if (!client.currentTest) return;
  
  const session = testSessions.get(client.currentTest);
  if (!session) return;
  
  const test = tests.get(session.testId);
  if (!test) return;
  
  const currentQuestion = test.questions[session.currentQuestionIndex];
  if (!currentQuestion) return;
  
  const timestamp = getCurrentTimestamp();
  client.logs.push(`${timestamp}: Answered fault ${faultId} for question ${currentQuestion.id}`);
  
  // Check if answer is correct
  if (currentQuestion.faults.includes(faultId)) {
    // Correct answer - remove fault from current troubles
    const answerRecord = client.answers.find(a => a.questionId === currentQuestion.id);
    if (!answerRecord) {
      client.answers.push({
        questionId: currentQuestion.id,
        answeredFaults: [faultId],
        timestamp
      });
    } else {
      if (!answerRecord.answeredFaults.includes(faultId)) {
        answerRecord.answeredFaults.push(faultId);
      }
    }
    
    client.logs.push(`${timestamp}: Correct! Fault ${faultId} resolved`);
    
    // Send updated state
    sendCurrentTestState(client);
    
    // Check if all faults resolved for this question
    const resolvedFaults = client.answers.find(a => a.questionId === currentQuestion.id)?.answeredFaults || [];
    if (currentQuestion.faults.every(f => resolvedFaults.includes(f))) {
      // Question completed, move to next question
      client.logs.push(`${timestamp}: Question completed!`);
      setTimeout(() => moveToNextQuestion(session), 2000);
    }
  } else {
    // Wrong answer
    client.logs.push(`${timestamp}: Wrong answer for fault ${faultId}`);
    client.socket.send(JSON.stringify({
      type: 'answer_result',
      correct: false,
      faultId
    }));
  }
}

function sendCurrentTestState(client: Client) {
  if (!client.currentTest) return;
  
  const session = testSessions.get(client.currentTest);
  if (!session) return;
  
  const test = tests.get(session.testId);
  if (!test) return;
  
  const currentQuestion = test.questions[session.currentQuestionIndex];
  if (!currentQuestion) return;
  
  // Get unresolved faults for current question
  const answerRecord = client.answers.find(a => a.questionId === currentQuestion.id);
  const resolvedFaults = answerRecord?.answeredFaults || [];
  const existTroubles = currentQuestion.faults.filter(f => !resolvedFaults.includes(f));
  
  client.socket.send(JSON.stringify({
    type: 'test_state',
    questionId: currentQuestion.id,
    questionNumber: session.currentQuestionIndex + 1,
    totalQuestions: test.questions.length,
    exist_troubles: existTroubles,
    timestamp: getCurrentTimestamp()
  }));
}

function moveToNextQuestion(session: TestSession) {
  session.currentQuestionIndex++;
  const test = tests.get(session.testId);
  if (!test) return;
  
  if (session.currentQuestionIndex >= test.questions.length) {
    // Test completed
    session.status = 'completed';
    session.clients.forEach(clientId => {
      const client = clients.get(clientId);
      if (client) {
        client.currentTest = undefined;
        client.currentQuestion = undefined;
        client.logs.push(`${getCurrentTimestamp()}: Test completed!`);
        client.socket.send(JSON.stringify({
          type: 'test_completed'
        }));
      }
    });
  } else {
    // Send new question to all clients
    session.clients.forEach(clientId => {
      const client = clients.get(clientId);
      if (client) {
        sendCurrentTestState(client);
      }
    });
  }
}

// Create Oak application
const app = new Application();
const router = new Router();

// WebSocket upgrade handler
app.use(async (ctx, next) => {
  if (ctx.request.url.pathname === "/ws") {
    if (ctx.request.headers.get("upgrade") === "websocket") {
      const socket = ctx.upgrade();
      const clientId = generateId();
      const clientIp = ctx.request.headers.get("x-forwarded-for") || 
                       ctx.request.headers.get("x-real-ip") || 
                       "unknown";
      
      const client: Client = {
        id: clientId,
        ip: clientIp,
        socket,
        answers: [],
        logs: [`${getCurrentTimestamp()}: Connected`]
      };
      
      clients.set(clientId, client);
      console.log(`Client ${clientId} connected from ${clientIp}`);
      
      socket.onmessage = (event) => {
        handleWebSocketMessage(client, event.data);
      };
      
      socket.onclose = () => {
        clients.delete(clientId);
        console.log(`Client ${clientId} disconnected`);
      };
      
      socket.onerror = (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        clients.delete(clientId);
      };
      
      // Send connection confirmation
      socket.send(JSON.stringify({
        type: 'connected',
        clientId,
        timestamp: getCurrentTimestamp()
      }));
    }
  } else {
    await next();
  }
});

// API Routes
router.get("/api/faults", (ctx) => {
  ctx.response.body = faults;
});

router.get("/api/clients", (ctx) => {
  const clientList = Array.from(clients.values()).map(client => ({
    id: client.id,
    ip: client.ip,
    currentTest: client.currentTest,
    currentQuestion: client.currentQuestion,
    logCount: client.logs.length
  }));
  ctx.response.body = clientList;
});

router.get("/api/client/:id/logs", (ctx) => {
  const clientId = ctx.params.id;
  const client = clients.get(clientId);
  if (!client) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Client not found" };
    return;
  }
  ctx.response.body = client.logs;
});

router.post("/api/test", async (ctx) => {
  const body = await ctx.request.body().value;
  const { questions, clientIds } = body;
  
  const testId = generateId();
  const test: Test = {
    id: testId,
    questions: questions.map((q: any, index: number) => ({
      id: `q${index + 1}`,
      faults: q.faults
    })),
    startTime: getCurrentTimestamp()
  };
  
  tests.set(testId, test);
  
  const session: TestSession = {
    testId,
    clients: clientIds,
    currentQuestionIndex: 0,
    startTime: test.startTime,
    status: 'pending'
  };
  
  testSessions.set(testId, session);
  
  // Assign test to clients
  clientIds.forEach((clientId: string) => {
    const client = clients.get(clientId);
    if (client) {
      client.currentTest = testId;
      client.currentQuestion = 0;
      client.answers = [];
      client.logs.push(`${getCurrentTimestamp()}: Test ${testId} assigned`);
    }
  });
  
  ctx.response.body = { testId, sessionId: testId };
});

router.post("/api/test/:id/start", (ctx) => {
  const testId = ctx.params.id;
  const session = testSessions.get(testId);
  
  if (!session) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Test session not found" };
    return;
  }
  
  session.status = 'active';
  session.startTime = getCurrentTimestamp();
  
  // Send first question to all clients
  session.clients.forEach(clientId => {
    const client = clients.get(clientId);
    if (client) {
      sendCurrentTestState(client);
    }
  });
  
  ctx.response.body = { success: true };
});

router.get("/api/test/:id/status", (ctx) => {
  const testId = ctx.params.id;
  const session = testSessions.get(testId);
  
  if (!session) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Test session not found" };
    return;
  }
  
  const clientStatuses = session.clients.map(clientId => {
    const client = clients.get(clientId);
    return client ? {
      id: client.id,
      ip: client.ip,
      answers: client.answers,
      logCount: client.logs.length
    } : null;
  }).filter(Boolean);
  
  ctx.response.body = {
    session,
    clients: clientStatuses
  };
});

// CORS middleware
app.use(async (ctx, next) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "*");
  ctx.response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 200;
    return;
  }
  
  await next();
});

app.use(router.routes());
app.use(router.allowedMethods());

const PORT = 8000;
console.log(`Server starting on port ${PORT}`);

if (import.meta.main) {
  await app.listen({ port: PORT });
}

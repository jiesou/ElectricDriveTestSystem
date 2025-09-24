import { Router } from "@oak/oak";
import { TestSystemManager, WSMessage, AnswerMessage, QuestionNavigationMessage } from "../types.ts";

export function createWebSocketHandler(manager: TestSystemManager): Router {
  const router = new Router();

  router.get("/ws", async (ctx) => {
    if (!ctx.isUpgradable) {
      ctx.throw(400, "Connection is not upgradable to WebSocket");
      return;
    }

    const socket = await ctx.upgrade();
    const clientId = crypto.randomUUID();
    const clientIp = ctx.request.ip || "unknown";

    manager.addClient(clientId, clientIp, socket);

    socket.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data as string);
        handleWebSocketMessage(manager, clientId, socket, message);
      } catch (error) {
        console.error(`Error parsing message from ${clientId}:`, error);
        sendError(socket, "Invalid JSON message");
      }
    };

    socket.onclose = () => {
      manager.removeClient(clientId);
    };

    socket.onerror = (error) => {
      console.error(`WebSocket error for ${clientId}:`, error);
      manager.removeClient(clientId);
    };

    // Send welcome message
    socket.send(JSON.stringify({
      type: "connected",
      clientId,
      timestamp: Date.now() / 1000,
    }));
  });

  return router;
}

function handleWebSocketMessage(
  manager: TestSystemManager, 
  clientId: string, 
  socket: WebSocket, 
  message: WSMessage
) {
  console.log(`Message from ${clientId}:`, message);

  switch (message.type) {
    case "answer":
      handleAnswerMessage(manager, clientId, socket, message as AnswerMessage);
      break;
    
    case "next_question":
    case "last_question":
      handleQuestionNavigation(manager, clientId, socket, message as QuestionNavigationMessage);
      break;
    
    case "ping":
      socket.send(JSON.stringify({ type: "pong", timestamp: Date.now() / 1000 }));
      break;
    
    default:
      sendError(socket, `Unknown message type: ${message.type}`);
  }
}

function handleAnswerMessage(
  manager: TestSystemManager, 
  clientId: string, 
  socket: WebSocket, 
  message: AnswerMessage
) {
  const isCorrect = manager.handleAnswer(clientId, message.trouble_id);
  
  socket.send(JSON.stringify({
    type: "answer_result",
    result: isCorrect,
    trouble_id: message.trouble_id,
    timestamp: Date.now() / 1000,
  }));

  console.log(`Client ${clientId} answered trouble ${message.trouble_id}: ${isCorrect ? 'CORRECT' : 'INCORRECT'}`);
}

function handleQuestionNavigation(
  manager: TestSystemManager, 
  clientId: string, 
  socket: WebSocket, 
  message: QuestionNavigationMessage
) {
  const direction = message.type === "next_question" ? "next" : "prev";
  const success = manager.navigateQuestion(clientId, direction);
  
  socket.send(JSON.stringify({
    type: "navigation_result",
    success,
    direction,
    timestamp: Date.now() / 1000,
  }));

  console.log(`Client ${clientId} navigated ${direction}: ${success ? 'SUCCESS' : 'FAILED'}`);
}

function sendError(socket: WebSocket, error: string) {
  socket.send(JSON.stringify({
    type: "error",
    message: error,
    timestamp: Date.now() / 1000,
  }));
}
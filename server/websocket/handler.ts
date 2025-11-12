import {
  Client,
  Trouble,
  TROUBLES,
  AnswerResultMessage,
  FinishResultMessage,
  getSecondTimestamp,
} from "../types.ts";
import { manager } from "../TestSystemManager.ts";
import { wsManager } from "./manager.ts";
import { yoloManager } from "../YoloClientManager.ts";

/**
 * 处理 WebSocket 消息
 * 根据消息类型分发到相应的处理函数
 */
export function handleWebSocketMessage(
  client: Client,
  socket: WebSocket,
  message: Record<string, unknown>,
) {
  console.log(`Message from ${client.id}:`, message);

  switch (message.type) {
    case "answer":
      handleAnswerMessage(client, socket, message);
      break;

    case "next_question":
    case "last_question":
      handleNavigationMessage(client, message);
      break;

    case "finish":
      handleFinishMessage(client, socket, message);
      break;

    case "evaluate_wiring_yolo_request":
      handleEvaluateWiringYoloRequest(client, socket, message);
      break;

    case "face_signin_request":
      handleFaceSigninRequest(client, socket, message);
      break;

    default:
      console.warn(`Unknown message type: ${message.type}`);
      wsManager.safeSend(socket, {
        type: "error",
        message: `Unknown message type: ${message.type}`,
        timestamp: getSecondTimestamp(),
      });
  }
}

/**
 * 处理答题消息
 */
function handleAnswerMessage(
  client: Client,
  socket: WebSocket,
  message: Record<string, unknown>,
) {
  const troubleId = message.trouble_id as number;
  if (!client.testSession) {
    wsManager.safeSend(socket, {
      type: "error",
      message: "No active test session",
      timestamp: getSecondTimestamp(),
    });
    return;
  }

  const trouble = TROUBLES.find((t) => t.id === troubleId);
  if (!trouble) {
    wsManager.safeSend(socket, {
      type: "error",
      message: "Trouble not found",
      timestamp: getSecondTimestamp(),
    });
    return;
  }

  const isCorrect = manager.handleAnswer(client, trouble);
  wsManager.safeSend(socket, {
    type: "answer_result",
    timestamp: getSecondTimestamp(),
    result: isCorrect,
    trouble,
  } as AnswerResultMessage);
}

/**
 * 处理题目导航消息
 */
function handleNavigationMessage(
  client: Client,
  message: Record<string, unknown>,
) {
  const direction = message.type === "next_question" ? "next" : "prev";
  manager.navigateQuestion(client, direction);
}

/**
 * 处理完成测验消息
 */
function handleFinishMessage(
  client: Client,
  socket: WebSocket,
  message: Record<string, unknown>,
) {
  const timestamp = typeof message.timestamp === "number"
    ? message.timestamp
    : undefined;

  const finishedScore = manager.finishTest(client, timestamp);
  wsManager.safeSend(socket, {
    type: "finish_result",
    finished_score: finishedScore,
    timestamp: getSecondTimestamp(),
  } as FinishResultMessage);
}

/**
 * 处理装接评估 YOLO 请求
 */
function handleEvaluateWiringYoloRequest(
  client: Client,
  socket: WebSocket,
  _message: Record<string, unknown>,
) {
  try {
    // 查找可用的 YOLO 客户端
    const onlineYoloClients = yoloManager.getOnlineYoloClients();
    
    if (onlineYoloClients.length === 0) {
      wsManager.safeSend(socket, {
        type: "error",
        message: "No YOLO client available",
        timestamp: getSecondTimestamp(),
      });
      return;
    }

    // 创建装接评估会话
    const session = yoloManager.createEvaluateWiringSession(client);
    
    // 通知客户端会话已创建，等待拍照
    wsManager.safeSend(socket, {
      type: "evaluate_wiring_yolo_started",
      message: "Evaluation session started, waiting for images",
      timestamp: getSecondTimestamp(),
    });

    console.log(`[WebSocket] Created evaluate_wiring session for client ${client.id}`);
  } catch (error) {
    console.error(`[WebSocket] Error handling evaluate_wiring_yolo_request:`, error);
    wsManager.safeSend(socket, {
      type: "error",
      message: error instanceof Error ? error.message : "Failed to start evaluation",
      timestamp: getSecondTimestamp(),
    });
  }
}

/**
 * 处理人脸签到请求
 */
function handleFaceSigninRequest(
  client: Client,
  socket: WebSocket,
  _message: Record<string, unknown>,
) {
  try {
    // 查找可用的 YOLO 客户端
    const onlineYoloClients = yoloManager.getOnlineYoloClients();
    
    if (onlineYoloClients.length === 0) {
      wsManager.safeSend(socket, {
        type: "error",
        message: "No YOLO client available",
        timestamp: getSecondTimestamp(),
      });
      return;
    }

    // 创建人脸签到会话
    const session = yoloManager.createFaceSigninSession(client);
    
    // 通知客户端会话已创建，开始识别
    wsManager.safeSend(socket, {
      type: "face_signin_started",
      message: "Face signin session started, waiting for face detection",
      timestamp: getSecondTimestamp(),
    });

    console.log(`[WebSocket] Created face_signin session for client ${client.id}`);
  } catch (error) {
    console.error(`[WebSocket] Error handling face_signin_request:`, error);
    wsManager.safeSend(socket, {
      type: "error",
      message: error instanceof Error ? error.message : "Failed to start face signin",
      timestamp: getSecondTimestamp(),
    });
  }
}

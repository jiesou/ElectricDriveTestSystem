import { clientManager } from "./ClientManager.ts";
import { getSecondTimestamp, EvaluateFunctionBoardUpdateMessage, EvaluateBoard, EvaluateWiringSession, FaceSigninSession } from "./types.ts";

// 装接评估相关消息处理器
clientManager.addOnMessageHandler((client, socket, message) => {
  try {
    const t = message.type as string;
    if (!t) return;

    if (t === "evaluate_function_board_update") {
      const msg = message as EvaluateFunctionBoardUpdateMessage;
      const board: EvaluateBoard = {
        description: msg.description,
        function_steps: msg.function_steps,
      };
      client.evaluateBoard = board;
      console.log(`[evaluate] Updated evaluate board for client ${client.id}: ${board.description}`);
      return;
    }

    if (t === "evaluate_wiring_yolo_request") {
      if (!client.cvClient) {
        clientManager.safeSend(socket, { type: "error", message: "No CV client configured", timestamp: getSecondTimestamp() });
        return;
      }
      const session: EvaluateWiringSession = {
        type: "evaluate_wiring",
        startTime: getSecondTimestamp(),
        shots: [],
      };
      client.cvClient.session = session;
      console.log(`[evaluate] Started evaluate_wiring session for client ${client.id}`);
      return;
    }

    if (t === "face_signin_request") {
      if (!client.cvClient) {
        clientManager.safeSend(socket, { type: "error", message: "No CV client configured", timestamp: getSecondTimestamp() });
        return;
      }
      const session: FaceSigninSession = {
        type: "face_signin",
        startTime: getSecondTimestamp(),
      };
      client.cvClient.session = session;
      console.log(`[evaluate] Started face_signin session for client ${client.id}`);
      return;
    }
  } catch (err) {
    console.error('[evaluate] message handler error:', err);
  }
});
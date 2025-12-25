import { clientManager } from "./ClientManager.ts";
import {
  EvaluateBoard,
  EvaluateFunctionBoardUpdateRequestMessage,
  EvaluateWiringSession,
  getSecondTimestamp,
} from "./types.ts";

clientManager.addWSMessageHandler((client, socket, message) => {
  switch (message.type) {
    case "evaluate_function_board_update": {
      const msg = message as EvaluateFunctionBoardUpdateRequestMessage;
      const board: EvaluateBoard = {
        description: msg.description,
        function_steps: msg.function_steps,
      };
      client.evaluateBoard = board;
      console.log(
        `[evaluate] Updated evaluate board for client ${client.id}: ${board.description}`,
      );
      break;
    }
    case "evaluate_wiring_yolo_request": {
      if (!client.cvClient) {
        clientManager.sendWSMessage(socket, {
          type: "error",
          message: "No CV client configured",
          timestamp: getSecondTimestamp(),
        });
        return;
      }
      const session: EvaluateWiringSession = {
        type: "evaluate_wiring",
        startTime: getSecondTimestamp(),
        shots: [],
      };
      client.cvClient.session = session;
      console.log(
        `[evaluate] Started evaluate_wiring session for client ${client.id}`,
      );
      break;
    }
  }
});

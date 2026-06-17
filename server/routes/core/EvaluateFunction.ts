import { clientManager } from "./ClientManager.ts";
import {
  EvaluateBoard,
  EvaluateFunctionBoardUpdateRequestMessage,
  EvaluateWiringSession,
  XiaoxinStatus,
} from "../../types.ts";
import { getSecondTimestamp } from "../../utils/helpers.ts";

clientManager.addWSMessageHandler((client, socket, message) => {
  switch (message.type) {
    case "evaluate_function_board_update_request": {
      const msg = message as EvaluateFunctionBoardUpdateRequestMessage;
      const board: EvaluateBoard = {
        description: msg.description,
        function_steps: msg.function_steps,
      };
      client.evaluateBoard = board;
      console.log(
        `[evaluate] Updated evaluate board for client ${client.id}: ${board.description}`,
      );

      // 更新小新智能体状态
      if (client.cvClient) {
        // 检查是否有未通过的步骤
        const hasFailedStep = msg.function_steps?.some(step => step.finished && !step.passed) ?? false;

        if (hasFailedStep) {
          // 有步骤未通过，需要排故
          const xiaoxinStatus: XiaoxinStatus = {
            type: "evaluate_need_troubleshoot",
            evaluate_need_troubleshoot_type: "M1_NOT_START",
          };
          client.cvClient.xiaoxin_status = xiaoxinStatus;
        } else {
          // 正在功能评估
          const xiaoxinStatus: XiaoxinStatus = {
            type: "status_text_update",
            status_text: "我在检查你的功能！",
          };
          client.cvClient.xiaoxin_status = xiaoxinStatus;
        }
      }
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

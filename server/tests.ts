import { clientManager } from "./ClientManager.ts";
import { manager } from "./TestSystemManager.ts";
import { getSecondTimestamp, FinishResultMessage, TROUBLES } from "./types.ts";

// 排故测验相关消息处理器注册
clientManager.addOnMessageHandler((client, socket, message) => {
  try {
    const t = message.type as string;
    if (!t) return;

    switch (t) {
      case "trouble_tests_update": {
        // 客户端上传整个 testSession 或更新
        // 直接覆盖 client.testSession（客户端为胖客户端，服务端只保存状态）
        const session = (message as any).testSession;
        if (session) {
          client.testSession = session;
          console.log(`[tests] Updated testSession for client ${client.id}`);
        }
        break;
      }

      // 其他与测验相关的类型可以在这里继续加入，保持职责集中

      default:
        return;
    }
  } catch (err) {
    console.error('[tests] message handler error:', err);
  }
});
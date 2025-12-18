import { clientManager } from "./ClientManager.ts";

// SystemManager 负责存储和数据持久化
export class SystemManager {
  constructor() {
    /* 野鸡持久存储方案 */
    try {
      const data = JSON.parse(Deno.readTextFileSync("data.json"));

      // 恢复客户端数据到 clientManager
      if (data.clients) {
        for (const [clientId, clientDataRaw] of Object.entries(data.clients)) {
          const clientData = clientDataRaw as any;
          if (!clientData || typeof clientData !== "object") {
            continue;
          }
          // 恢复客户端状态，但保持离线状态（因为重启后WebSocket连接都断了）
          const restoredClient = {
            ...clientData,
            online: false,
            socket: undefined, // 移除 socket 引用
          };
          clientManager.clients[clientId] = restoredClient;
        }
      }
    } catch (error) {
      console.error("读取 data.json 数据库时出错，自动使用全新默认数据:", error);
    }

    // 自动保存
    setInterval(
      () => {
        // 保存前移除 socket 对象（不能序列化）
        const dataToSave = {
          clients: Object.fromEntries(
            Object.entries(clientManager.clients).map(([id, client]) => [
              id,
              {
                ...client,
                socket: undefined, // 移除 socket 引用
              },
            ]),
          ),
        };
        Deno.writeTextFileSync("data.json", JSON.stringify(dataToSave));
      },
      5000,
    );
  }
}

// 全局单例
export const systemManager = new SystemManager();

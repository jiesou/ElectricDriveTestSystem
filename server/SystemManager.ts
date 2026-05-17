import { clientManager } from "./ClientManager.ts";
import { join } from "@std/path";

// 数据文件路径
const DATA_DIR = join(Deno.cwd(), "data");
const DATA_FILE = join(DATA_DIR, "data.json");

// SystemManager 负责存储和数据持久化
export class SystemManager {
  constructor() {
    /* 野鸡持久存储方案 */
    try {
      // 确保 data 目录存在
      try {
        Deno.mkdirSync(DATA_DIR, { recursive: true });
      } catch (_e) {
        // 忽略已存在的错误
      }

      const data = JSON.parse(Deno.readTextFileSync(DATA_FILE));

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

        // 重建 cvClients 共享引用（避免恢复后每个客户端持有独立的 cvClient 副本）
        for (const client of Object.values(clientManager.clients)) {
          if (client.cvClient) {
            const cvIp = client.cvClient.ip;
            if (!clientManager.cvClients[cvIp]) {
              clientManager.cvClients[cvIp] = client.cvClient;
            }
            client.cvClient = clientManager.cvClients[cvIp];
          }
        }
      }
    } catch (error) {
      console.error("读取 data/data.json 数据库时出错，自动使用全新默认数据:", error);
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
        Deno.writeTextFileSync(DATA_FILE, JSON.stringify(dataToSave));
      },
      5000,
    );
  }
}

// 全局单例
export const systemManager = new SystemManager();

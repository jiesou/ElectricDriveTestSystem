import {
  Client,
  CvClient,
  ESPCAMClient,
  JetsonNanoClient,
  CV_CLIENT_MAP,
  getSecondTimestamp,
} from "./types.ts";

/**
 * ClientManager 负责管理WebSocket连接和客户端状态
 * 包括ping/pong心跳检测、连接/断开管理、CV客户端关联
 */
export class ClientManager {
  // 所有客户端的映射表 (clientId -> Client)
  public clients: Record<string, Client> = {};
  
  private heartbeatInterval?: number;
  private readonly HEARTBEAT_TIMEOUT = 10; // 心跳超时时间（秒）
  private readonly HEARTBEAT_CHECK_INTERVAL = 2000; // 心跳检查间隔（毫秒）

  constructor() {
    this.startHeartbeatChecker();
  }

  /**
   * 连接或重连客户端
   * 如果IP已存在，则复用现有客户端；否则创建新客户端
   */
  connectClient(ip: string, socket: WebSocket): Client {
    // 查找是否有相同IP的客户端
    const existingClient = Object.values(this.clients).find(
      (client) => client.ip === ip,
    );

    const timestamp = getSecondTimestamp();

    if (existingClient) {
      // 重连现有客户端
      existingClient.online = true;
      existingClient.socket = socket;
      existingClient.lastPing = timestamp;

      console.log(`[ClientManager] Client ${existingClient.id} (${ip}) reconnected`);
      return existingClient;
    } else {
      // 创建新客户端
      const clientId = crypto.randomUUID();
      const client: Client = {
        id: clientId,
        name: ip, // 默认名称为IP地址
        ip,
        online: true,
        socket,
        lastPing: timestamp,
      };

      // 根据CV_CLIENT_MAP关联CV客户端
      this.attachCvClient(client);

      this.clients[clientId] = client;
      console.log(`[ClientManager] New client ${clientId} (${ip}) connected`);
      return client;
    }
  }

  /**
   * 断开客户端连接
   */
  disconnectClient(client: Client): void {
    client.online = false;
    delete client.socket;
    delete client.lastPing;
    console.log(`[ClientManager] Client ${client.id} disconnected`);
  }

  /**
   * 处理ping消息，更新lastPing时间戳
   */
  handlePing(client: Client, socket: WebSocket): void {
    client.lastPing = getSecondTimestamp();
    client.online = true;
    client.socket = socket; // 更新socket引用
    
    // 发送pong响应
    this.safeSend(socket, {
      type: "pong",
      timestamp: getSecondTimestamp(),
    });
  }

  /**
   * 安全发送WebSocket消息
   */
  safeSend(socket: WebSocket, message: Record<string, unknown>): void {
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(message));
      } catch (error) {
        console.error("[ClientManager] Failed to send WebSocket message:", error);
      }
    }
  }

  /**
   * 根据CV_CLIENT_MAP为客户端关联CV客户端
   */
  private attachCvClient(client: Client): void {
    const mapping = CV_CLIENT_MAP.find((m) => m.clientIp === client.ip);
    if (!mapping) {
      return; // 没有配置CV客户端映射，跳过
    }

    // 创建CV客户端对象
    const cvClient: CvClient = {
      clientType: mapping.cvClientType,
      ip: mapping.cvClientIp,
    };

    client.cvClient = cvClient;
    console.log(
      `[ClientManager] Attached CV client (${mapping.cvClientType}) at ${mapping.cvClientIp} to client ${client.id}`,
    );
  }

  /**
   * 启动心跳检测器
   * 定期检查所有客户端的lastPing，超时则断开连接
   */
  private startHeartbeatChecker(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = getSecondTimestamp();
      
      for (const [_id, client] of Object.entries(this.clients)) {
        if (!client.online) continue;
        if (!client.lastPing) continue;
        
        const timeSinceLastPing = now - client.lastPing;
        if (timeSinceLastPing > this.HEARTBEAT_TIMEOUT) {
          console.log(
            `[ClientManager] Client ${client.id} timed out (no ping for ${timeSinceLastPing}s), disconnecting`,
          );
          
          // 尝试关闭WebSocket连接
          if (client.socket && client.socket.readyState === WebSocket.OPEN) {
            try {
              client.socket.close(4000, "heartbeat timeout");
            } catch (_e) {
              // 忽略关闭错误
            }
          }
          
          this.disconnectClient(client);
        }
      }
    }, this.HEARTBEAT_CHECK_INTERVAL);
  }

  /**
   * 清理所有客户端连接
   * 用于"忘记所有客户端"功能
   */
  clearAllClients(): number {
    const clientsToClear = Object.values(this.clients);

    for (const client of clientsToClear) {
      if (client.socket && client.socket.readyState === WebSocket.OPEN) {
        try {
          client.socket.close(1000, "Cleared by administrator");
        } catch (error) {
          console.error(
            `[ClientManager] Failed to close socket for client ${client.id}:`,
            error,
          );
        }
      }
    }

    const clearedCount = clientsToClear.length;
    this.clients = {};
    return clearedCount;
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }
}

// 全局单例
export const clientManager = new ClientManager();

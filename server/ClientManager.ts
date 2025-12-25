import {
  Client,
  CvClient,
  CV_CLIENT_MAP,
  getSecondTimestamp,
  WSMessage,
  WSMessageHandler,
  PongMessage,
} from "./types.ts";

/**
 * ClientManager 负责管理WebSocket连接和客户端状态
 * 包括ping/pong心跳检测、连接/断开管理、CV客户端关联
 */
export class ClientManager {
  // 所有客户端的映射表 (clientId -> Client)
  public clients: Record<string, Client> = {};
  // 按 CV IP 复用的客户端实例
  private cvPool: Record<string, CvClient> = {};
  
  // relay_rainbow 响应回调 (clientId -> resolve function)
  public relayRainbowCallbacks: Map<string, (latencyMs: number) => void> = new Map();
  
  private readonly HEARTBEAT_TIMEOUT = 10; // 心跳超时时间（秒）
  private readonly HEARTBEAT_CHECK_INTERVAL = 2000; // 心跳检查间隔（毫秒）

  constructor() {
    setInterval(() => {
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
      this.clients[clientId] = client;
      this.syncCvClients();
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

  private wsMessageHandlers: WSMessageHandler[] = [];

  /**
   * 注册WebSocket消息处理器
   */
  addWSMessageHandler(handler: WSMessageHandler): void {
    this.wsMessageHandlers.push(handler);
  }

  /**
   * 仅在server.ts由socket.onmessage调用，处理并分发消息给注册的处理器
   */
  processWebSocketMessageIn(client: Client, socket: WebSocket, message: WSMessage): void {
    client.socket = socket; // 确保 socket 引用是最新的
    // 处理应用层 ping 消息
    if (
      message && typeof message.type === "string" && message.type === "ping"
    ) {
      client.lastPing = getSecondTimestamp();
      client.online = true;
      const pongMessage: PongMessage = {
        type: "pong",
        timestamp: getSecondTimestamp(),
      };
      clientManager.sendWSMessage(client.socket, pongMessage);
      return;
    }

    if (!this.wsMessageHandlers || this.wsMessageHandlers.length === 0) return;
    for (const handler of this.wsMessageHandlers) {
      handler(client, socket, message);
    }
  }

  /**
   * 安全发送WebSocket消息
   */
  sendWSMessage(socket: WebSocket | undefined, message: WSMessage): void {
    if (socket) {
      try {
        console.log("Sent message:", message);
        socket.send(JSON.stringify(message));
      } catch (error) {
        console.error("[ClientManager] Failed to send WebSocket message:", error);
      }
    } else {
      console.warn(`[ClientManager] Cannot send message to client, there is no socket.`);
    }
  }

  private syncCvClients(): void {
    for (const mapping of CV_CLIENT_MAP) {
      const shared = this.cvPool[mapping.cvClientIp] ?? {
        clientType: mapping.cvClientType,
        ip: mapping.cvClientIp,
      };
      this.cvPool[mapping.cvClientIp] = shared;
      for (const c of Object.values(this.clients)) {
        if (c.ip === mapping.clientIp) {
          c.cvClient = shared;
        }
      }
    }
  }

  /**
   * 根据CV客户端IP查找关联的普通客户端
   * 当只有一个客户端且没有绑定CV时，自动绑定
   */
  findClientsByCvIp(cvClientIp: string): Client[] {
    const matched = Object.values(this.clients).filter(
      (c) => c.cvClient?.ip === cvClientIp,
    );
    if (matched.length > 0) return matched;

    const allClients = Object.values(this.clients);
    if (allClients.length === 1) {
      const onlyClient = allClients[0];
      onlyClient.cvClient = this.cvPool[cvClientIp] ?? {
        clientType: "jetson_nano",
        ip: cvClientIp,
      };
      this.cvPool[cvClientIp] = onlyClient.cvClient;
      return [onlyClient];
    }
    return [];
  }

  findClientByCvIp(cvClientIp: string): Client | null {
    const list = this.findClientsByCvIp(cvClientIp);
    return list[0] || null;
  }
}

// 全局单例
export const clientManager = new ClientManager();

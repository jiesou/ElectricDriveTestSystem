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

      if (existingClient.testSession)
        // 恢复测验状态
        import("./TroubleTest.ts").then(({ troubleTest }) => {
          troubleTest.pushTestToClient(existingClient, existingClient.testSession!.test);
        });

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
    if (socket && socket.readyState === WebSocket.OPEN) {
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
      `[ClientManager] 关联视觉客户端 ${mapping.cvClientIp} (${mapping.cvClientType}) 到普通客户端 ${client.id} ${client.ip}`,
    );
  }

  /**
   * 根据CV客户端IP查找关联的普通客户端
   * 当只有一个客户端且没有绑定CV时，自动绑定
   */
  findClientByCvIp(cvClientIp: string): Client | null {
    // 先尝试精确匹配
    const exactMatch = Object.values(this.clients).find(
      (c) => c.cvClient?.ip === cvClientIp,
    );
    if (exactMatch) {
      return exactMatch;
    }

    // 如果只有一个客户端，且没有绑定CV客户端，自动绑定
    const allClients = Object.values(this.clients);
    if (allClients.length === 1) {
      const onlyClient = allClients[0];
      // 可能会覆盖掉已有的cvClient绑定，预期行为
      onlyClient.cvClient = {
        clientType: "jetson_nano", // 默认类型
        ip: cvClientIp,
      };
      console.log(
        `[ClientManager] 自动绑定 CV 客户端 ${cvClientIp} 到唯一的普通客户端 ${onlyClient.id}`,
      );
      return onlyClient;
    }

    return null;
  }
}

// 全局单例
export const clientManager = new ClientManager();

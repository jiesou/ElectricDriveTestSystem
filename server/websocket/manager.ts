import { Client, YoloClient, getSecondTimestamp } from "../types.ts";

/**
 * WebSocket 连接管理器
 * 负责管理客户端连接、心跳检测、在线状态等
 */
export class WebSocketManager {
  constructor() {
    // 启动心跳检测
    this.startHeartbeatChecker();
  }

  /**
   * 连接或重连普通客户端
   */
  connectClient(ip: string, socket: WebSocket, existingClients: Record<string, Client>): Client {
    // 先查找是否有相同IP的客户机
    const existingClient = Object.values(existingClients).find(
      (client) => client.ip === ip,
    );

    const timestamp = getSecondTimestamp();

    if (existingClient) {
      // 重连现有客户端
      existingClient.online = true;
      existingClient.socket = socket;
      existingClient.lastPing = timestamp;

      console.log(`Client ${existingClient.id} (${ip}) reconnected`);
      return existingClient;
    } else {
      // 创建新客户端
      const clientId = crypto.randomUUID();
      const client: Client = {
        id: clientId,
        name: ip, // Default name is IP address
        ip,
        online: true,
        socket,
        lastPing: timestamp,
      };
      console.log(`New client ${clientId} (${ip}) connected`);
      return client;
    }
  }

  /**
   * 断开客户端连接
   */
  disconnectClient(client: Client) {
    client.online = false;
    delete client.socket;
    delete client.lastPing;
    console.log(`Client ${client.id} disconnected`);
  }

  /**
   * 连接或重连 YOLO 客户端
   */
  connectYoloClient(
    ip: string,
    type: "espcam" | "jetson_nano",
    existingYoloClients: Record<string, YoloClient>,
  ): YoloClient {
    // 查找是否有相同IP的YOLO客户端
    const existingClient = Object.values(existingYoloClients).find(
      (client) => client.ip === ip,
    );

    const timestamp = getSecondTimestamp();

    if (existingClient) {
      // 重连现有客户端
      existingClient.online = true;
      existingClient.lastPing = timestamp;
      console.log(`YoloClient ${existingClient.id} (${ip}) reconnected`);
      return existingClient;
    } else {
      // 创建新YOLO客户端
      const clientId = crypto.randomUUID();
      const client: YoloClient = {
        id: clientId,
        name: `${type}_${ip}`,
        ip,
        type,
        online: true,
        lastPing: timestamp,
      };
      console.log(`New YoloClient ${clientId} (${ip}, type: ${type}) connected`);
      return client;
    }
  }

  /**
   * 断开 YOLO 客户端连接
   */
  disconnectYoloClient(client: YoloClient) {
    client.online = false;
    delete client.lastPing;
    console.log(`YoloClient ${client.id} disconnected`);
  }

  /**
   * 处理应用层 ping 消息
   */
  handlePing(client: Client, socket: WebSocket) {
    client.lastPing = getSecondTimestamp();
    client.online = true;
    client.socket = socket; // 更新 socket 引用
    this.safeSend(socket, {
      type: "pong",
      timestamp: getSecondTimestamp(),
    });
  }

  /**
   * 处理 YOLO 客户端的 ping
   */
  handleYoloPing(client: YoloClient) {
    client.lastPing = getSecondTimestamp();
    client.online = true;
  }

  /**
   * 安全发送 WebSocket 消息
   */
  safeSend(socket: WebSocket, message: Record<string, unknown>): boolean {
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error("Failed to send WebSocket message:", error);
        return false;
      }
    }
    return false;
  }

  /**
   * 启动心跳检测
   * 注意：这个方法检查所有客户端，需要从外部传入客户端列表
   */
  private startHeartbeatChecker() {
    // 心跳检测现在由 TestSystemManager 的 broadcastTroubleStatus 中进行
    // 这里保留空实现，避免破坏现有逻辑
    // 实际心跳检测逻辑已在 TestSystemManager 中实现
  }
}

// 全局单例
export const wsManager = new WebSocketManager();

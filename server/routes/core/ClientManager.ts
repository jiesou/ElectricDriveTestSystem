import {
  Client,
  ClientNamePushMessage,
  ClientNameUpdateRequestMessage,
  CV_CLIENT_MAP,
  CvClient,
  PongMessage,
  WSMessage,
  WSMessageHandler,
} from "../../types.ts";
import { getSecondTimestamp } from "../../utils/helpers.ts";
import { prisma } from "../../prisma/client.ts";

const HEARTBEAT_TIMEOUT = 10; // 心跳超时时间（秒）
const HEARTBEAT_CHECK_INTERVAL = 2000; // 心跳检查间隔（毫秒）
let heartbeatId: ReturnType<typeof setInterval> | null = null;
const wsMessageHandlers: WSMessageHandler[] = [];

/**
 * ClientManager 负责管理WebSocket连接和客户端状态
 * 包括ping/pong心跳检测、连接/断开管理、CV客户端关联
 */
export const clientManager = {
  // 所有客户机实例 (clientId -> Client)
  clients: {} as Record<string, Client>,
  // 所有 CV 客户端实例 (cvClientIp -> CvClient)
  cvClients: {} as Record<string, CvClient>,

  // relay_rainbow 响应回调 (clientId -> resolve function)
  relayRainbowCallbacks: new Map<string, (latencyMs: number) => void>(),

  startHeartbeat(): void {
    heartbeatId = setInterval(() => {
      const now = getSecondTimestamp();

      for (const [_id, client] of Object.entries(this.clients)) {
        if (!client.online) continue;
        if (!client.lastPing) continue;

        const timeSinceLastPing = now - client.lastPing;
        if (timeSinceLastPing > HEARTBEAT_TIMEOUT) {
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
    }, HEARTBEAT_CHECK_INTERVAL);
  },

  stopHeartbeat(): void {
    if (heartbeatId !== null) {
      clearInterval(heartbeatId);
      heartbeatId = null;
    }
  },

  /**
   * 连接或重连客户端
   * 如果IP已存在，则复用现有客户端；否则创建新客户端
   */
  connectClient(ip: string, socket: WebSocket): Client {
    // 查找是否有相同IP的客户端
    let client: Client | undefined = Object.values(this.clients).find(
      (c) => c.ip === ip,
    );

    const timestamp = getSecondTimestamp();

    if (client) {
      // 重连现有客户端
      client.online = true;
      client.socket = socket;
      client.lastPing = timestamp;

      console.log(`[ClientManager] Client ${client.id} (${ip}) reconnected`);
    } else {
      // 创建新客户端
      const clientId = crypto.randomUUID();
      client = {
        id: clientId,
        name: ip, // 默认名称为IP地址
        ip,
        online: true,
        socket,
        lastPing: timestamp,
      };

      this.clients[clientId] = client;
      console.log(`[ClientManager] New client ${clientId} (${ip}) connected`);
    }

    // 根据CV_CLIENT_MAP关联CV客户端
    const mapping = CV_CLIENT_MAP.find((m) => m.clientIp === ip);
    if (mapping) {
      const cvIp = mapping.cvClientIp;
      if (!this.cvClients[cvIp]) {
        this.cvClients[cvIp] = {
          clientType: mapping.cvClientType,
          ip: cvIp,
        };
      }
      client.cvClient = this.cvClients[cvIp];
    }

    // 如果仍未绑定，尝试从已有 cvClients 中拾取第一个
    if (!client.cvClient) {
      const cvClientValues = Object.values(this.cvClients);
      if (cvClientValues.length > 0) {
        client.cvClient = cvClientValues[0];
      }
    }

    return client;
  },

  /**
   * 断开客户端连接
   */
  disconnectClient(client: Client): void {
    client.online = false;
    delete client.socket;
    delete client.lastPing;
    console.log(`[ClientManager] Client ${client.id} disconnected`);
  },

  /**
   * 注册WebSocket消息处理器
   */
  addWSMessageHandler(handler: WSMessageHandler): void {
    wsMessageHandlers.push(handler);
  },

  /**
   * 仅在server.ts由socket.onmessage调用，处理并分发消息给注册的处理器
   */
  processWebSocketMessageIn(
    client: Client,
    socket: WebSocket,
    message: WSMessage,
  ): void {
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
      this.sendWSMessage(client.socket, pongMessage);
      return;
    }

    // meta data 更新
    // 处理客户机名称更新请求
    if (message && message.type === "client_name_update_request") {
      const updateMsg = message as unknown as ClientNameUpdateRequestMessage;
      if (typeof updateMsg.name === "string" && updateMsg.name.trim() !== "") {
        client.name = updateMsg.name.trim();
        console.log(
          `[ClientManager] Client ${client.id} name updated to ${client.name}`,
        );
        this.persistClient(client);

        // 回复确认消息
        const pushMessage: ClientNamePushMessage = {
          type: "client_name_push",
          name: client.name,
          timestamp: getSecondTimestamp(),
        };
        this.sendWSMessage(client.socket, pushMessage);
      }
      return;
    }

    if (!wsMessageHandlers || wsMessageHandlers.length === 0) return;
    for (const handler of wsMessageHandlers) {
      handler(client, socket, message);
    }
  },

  /**
   * 安全发送WebSocket消息
   */
  sendWSMessage(socket: WebSocket | undefined, message: WSMessage): void {
    if (socket) {
      try {
        socket.send(JSON.stringify(message));
      } catch (error) {
        console.error(
          "[ClientManager] Failed to send WebSocket message:",
          error,
        );
      }
    } else {
      console.warn(
        `[ClientManager] Cannot send message to client, there is no socket.`,
      );
    }
  },

  /**
   * 根据CV客户端IP查找关联的普通客户端
   * 当只有一个客户端且没有绑定CV时，自动绑定
   */
  findClientsByCvIp(cvClientIp: string): Client[] {
    const matched = Object.values(this.clients).filter(
      (c) => c.cvClient?.ip === cvClientIp,
    );
    if (matched.length > 0) return matched;

    // 如果找不到绑定，则自动创建并全部绑定
    const newCvClient: CvClient = {
      clientType: "jetson_nano",
      ip: cvClientIp,
    };
    this.cvClients[cvClientIp] = newCvClient;
    for (const client of Object.values(this.clients)) {
      if (!client.cvClient) {
        client.cvClient = newCvClient;
      }
    }
    const newMatched = Object.values(this.clients).filter(
      (c) => c.cvClient?.ip === cvClientIp,
    );
    if (newMatched.length > 0) return newMatched;
    return [];
  },

  findClientByCvIp(cvClientIp: string): Client | null {
    const list = this.findClientsByCvIp(cvClientIp);
    return list[0] || null;
  },

  async persistClient(client: Client): Promise<void> {
    // 先持久化 CV 客户端，满足外键依赖
    if (client.cvClient) {
      await prisma.storedCvClient.upsert({
        where: { ip: client.cvClient.ip },
        update: {
          clientType: client.cvClient.clientType,
          sessionJson: client.cvClient.session
            ? JSON.stringify(client.cvClient.session)
            : null,
        },
        create: {
          ip: client.cvClient.ip,
          clientType: client.cvClient.clientType,
          sessionJson: client.cvClient.session
            ? JSON.stringify(client.cvClient.session)
            : null,
        },
      });
    }

    await prisma.storedClient.upsert({
      where: { id: client.id },
      update: {
        name: client.name,
        ip: client.ip,
        cvClientIp: client.cvClient?.ip || null,
        testSessionJson: client.testSession
          ? JSON.stringify(client.testSession)
          : null,
        evaluateBoardJson: client.evaluateBoard
          ? JSON.stringify(client.evaluateBoard)
          : null,
      },
      create: {
        id: client.id,
        name: client.name,
        ip: client.ip,
        cvClientIp: client.cvClient?.ip || null,
        testSessionJson: client.testSession
          ? JSON.stringify(client.testSession)
          : null,
        evaluateBoardJson: client.evaluateBoard
          ? JSON.stringify(client.evaluateBoard)
          : null,
      },
    });
  },

  async loadAllClients(): Promise<void> {
    // 先从独立表恢复所有 CV 客户端（含 session）
    const storedCvClients = await prisma.storedCvClient.findMany();
    for (const cv of storedCvClients) {
      this.cvClients[cv.ip] = {
        clientType: cv.clientType as CvClient["clientType"],
        ip: cv.ip,
        session: cv.sessionJson ? JSON.parse(cv.sessionJson) : undefined,
      };
    }

    const storedClients = await prisma.storedClient.findMany();
    for (const sc of storedClients) {
      this.clients[sc.id] = {
        id: sc.id,
        name: sc.name,
        ip: sc.ip,
        online: false,
        testSession: sc.testSessionJson
          ? JSON.parse(sc.testSessionJson)
          : undefined,
        evaluateBoard: sc.evaluateBoardJson
          ? JSON.parse(sc.evaluateBoardJson)
          : undefined,
      };

      // 绑定已恢复的 cvClient（共享引用）
      if (sc.cvClientIp && this.cvClients[sc.cvClientIp]) {
        this.clients[sc.id].cvClient = this.cvClients[sc.cvClientIp];
      }
    }
  },
};

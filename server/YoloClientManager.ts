import {
  YoloClient,
  YoloSession,
  EvaluateWiringSession,
  FaceSigninSession,
  getSecondTimestamp,
  Client,
} from "./types.ts";

/**
 * YOLO 客户端管理器
 * 负责管理机器视觉客户端（ESP32-CAM, Jetson Nano）和它们的会话
 */
export class YoloClientManager {
  public yoloClients: Record<string, YoloClient> = {};

  /**
   * 通过 IP 注册或更新 YOLO 客户端
   */
  registerYoloClient(
    ip: string,
    type: "espcam" | "jetson_nano",
  ): YoloClient {
    // 查找是否已存在
    const existing = Object.values(this.yoloClients).find((c) => c.ip === ip);
    
    if (existing) {
      existing.online = true;
      existing.lastPing = getSecondTimestamp();
      existing.type = type; // 更新类型
      console.log(`[YoloClientManager] Updated YoloClient ${existing.id} at ${ip}`);
      return existing;
    }

    // 创建新的 YOLO 客户端
    const clientId = crypto.randomUUID();
    const client: YoloClient = {
      id: clientId,
      name: `${type}_${ip}`,
      ip,
      type,
      online: true,
      lastPing: getSecondTimestamp(),
    };
    
    this.yoloClients[clientId] = client;
    console.log(`[YoloClientManager] Registered new YoloClient ${clientId} (${type}) at ${ip}`);
    return client;
  }

  /**
   * 通过 IP 查找 YOLO 客户端
   */
  findYoloClientByIp(ip: string): YoloClient | undefined {
    return Object.values(this.yoloClients).find((c) => c.ip === ip);
  }

  /**
   * 创建装接评估会话
   */
  createEvaluateWiringSession(
    requestingClient: Client,
    yoloClient?: YoloClient,
  ): EvaluateWiringSession {
    // 如果没有指定 yoloClient，选择第一个在线的
    if (!yoloClient) {
      yoloClient = Object.values(this.yoloClients).find((c) => c.online);
      if (!yoloClient) {
        throw new Error("No online YOLO client available");
      }
    }

    const session: EvaluateWiringSession = {
      type: "evaluate_wiring",
      clientId: requestingClient.id,
      startTime: getSecondTimestamp(),
      status: "active",
      shots: [],
    };

    yoloClient.currentSession = session;
    console.log(
      `[YoloClientManager] Created EvaluateWiringSession for client ${requestingClient.id} using YoloClient ${yoloClient.id}`,
    );
    
    return session;
  }

  /**
   * 创建人脸签到会话
   */
  createFaceSigninSession(
    requestingClient: Client,
    yoloClient?: YoloClient,
  ): FaceSigninSession {
    // 如果没有指定 yoloClient，选择第一个在线的
    if (!yoloClient) {
      yoloClient = Object.values(this.yoloClients).find((c) => c.online);
      if (!yoloClient) {
        throw new Error("No online YOLO client available");
      }
    }

    const session: FaceSigninSession = {
      type: "face_signin",
      clientId: requestingClient.id,
      startTime: getSecondTimestamp(),
      status: "active",
    };

    yoloClient.currentSession = session;
    console.log(
      `[YoloClientManager] Created FaceSigninSession for client ${requestingClient.id} using YoloClient ${yoloClient.id}`,
    );
    
    return session;
  }

  /**
   * 添加装接评估的图片和结果
   */
  addEvaluateWiringShot(
    yoloClientIp: string,
    image: string,
    result?: {
      sleeves_num: number;
      cross_num: number;
      excopper_num: number;
    },
  ): void {
    const yoloClient = this.findYoloClientByIp(yoloClientIp);
    if (!yoloClient) {
      throw new Error(`YOLO client not found for IP: ${yoloClientIp}`);
    }

    const session = yoloClient.currentSession;
    if (!session || session.type !== "evaluate_wiring") {
      throw new Error("No active evaluate_wiring session for this YOLO client");
    }

    const evaluateSession = session as EvaluateWiringSession;
    evaluateSession.shots.push({
      timestamp: getSecondTimestamp(),
      image,
      result,
    });

    console.log(
      `[YoloClientManager] Added shot to EvaluateWiringSession (total: ${evaluateSession.shots.length})`,
    );
  }

  /**
   * 完成装接评估会话
   */
  completeEvaluateWiringSession(
    yoloClientIp: string,
  ): EvaluateWiringSession {
    const yoloClient = this.findYoloClientByIp(yoloClientIp);
    if (!yoloClient) {
      throw new Error(`YOLO client not found for IP: ${yoloClientIp}`);
    }

    const session = yoloClient.currentSession;
    if (!session || session.type !== "evaluate_wiring") {
      throw new Error("No active evaluate_wiring session for this YOLO client");
    }

    const evaluateSession = session as EvaluateWiringSession;
    evaluateSession.status = "completed";

    // 计算综合结果
    let totalWoSleeves = 0;
    let totalCross = 0;
    let totalExcopper = 0;

    for (const shot of evaluateSession.shots) {
      if (shot.result) {
        // 假设缺少号码管 = 总数 - 已标的
        // 这里需要根据实际业务逻辑调整
        totalCross += shot.result.cross_num;
        totalExcopper += shot.result.excopper_num;
      }
    }

    // 计算得分（示例逻辑，需要根据实际需求调整）
    const totalIssues = totalWoSleeves + totalCross + totalExcopper;
    const scores = Math.max(0, 100 - totalIssues * 5); // 每个问题扣5分

    evaluateSession.final_result = {
      wo_sleeves_num: totalWoSleeves,
      cross_num: totalCross,
      excopper_num: totalExcopper,
      scores,
    };

    // 清除会话
    yoloClient.currentSession = undefined;

    console.log(
      `[YoloClientManager] Completed EvaluateWiringSession with score: ${scores}`,
    );
    
    return evaluateSession;
  }

  /**
   * 完成人脸签到会话
   */
  completeFaceSigninSession(
    yoloClientIp: string,
    who: string,
    image: string,
    confidence?: number,
  ): FaceSigninSession {
    const yoloClient = this.findYoloClientByIp(yoloClientIp);
    if (!yoloClient) {
      throw new Error(`YOLO client not found for IP: ${yoloClientIp}`);
    }

    const session = yoloClient.currentSession;
    if (!session || session.type !== "face_signin") {
      throw new Error("No active face_signin session for this YOLO client");
    }

    const faceSession = session as FaceSigninSession;
    faceSession.status = "completed";
    faceSession.final_result = {
      who,
      image,
      confidence,
    };

    // 清除会话
    yoloClient.currentSession = undefined;

    console.log(
      `[YoloClientManager] Completed FaceSigninSession, identified: ${who}`,
    );
    
    return faceSession;
  }

  /**
   * 获取所有在线的 YOLO 客户端
   */
  getOnlineYoloClients(): YoloClient[] {
    return Object.values(this.yoloClients).filter((c) => c.online);
  }

  /**
   * 更新 YOLO 客户端的心跳时间
   */
  updateYoloClientPing(ip: string): void {
    const client = this.findYoloClientByIp(ip);
    if (client) {
      client.lastPing = getSecondTimestamp();
      client.online = true;
    }
  }

  /**
   * 检查并断开超时的 YOLO 客户端
   */
  checkYoloClientTimeouts(timeoutSeconds: number = 30): void {
    const now = getSecondTimestamp();
    for (const client of Object.values(this.yoloClients)) {
      if (!client.online) continue;
      if (!client.lastPing) continue;
      
      if (now - client.lastPing > timeoutSeconds) {
        console.log(
          `[YoloClientManager] YoloClient ${client.id} timed out, marking as offline`,
        );
        client.online = false;
        // 如果有活跃会话，也标记为失败
        if (client.currentSession) {
          client.currentSession = undefined;
        }
      }
    }
  }
}

// 全局单例
export const yoloManager = new YoloClientManager();
import { Router } from "@oak/oak";
import { clientManager } from "../ClientManager.ts";
import {
  EvaluateWiringSession,
  FaceSigninSession,
  getSecondTimestamp,
  WiringShot,
  EvaluateWiringYoloResponseMessage,
  FaceSigninResponseMessage,
} from "../types.ts";

/**
 * CV上传路由
 * 处理来自ESP32-CAM或Jetson Nano的图片上传和推理结果
 */
export const cvRouter = new Router({ prefix: "/cv" });

/**
 * 上传图像帧（替代UDP方式）
 * POST /api/cv/upload_frame
 * 
 * 请求体：
 * {
 *   "cvClientIp": "192.168.1.200",
 *   "frame": "base64_encoded_jpeg_data"  // 或直接发送二进制数据
 * }
 */
cvRouter.post("/upload_frame", async (ctx) => {
  try {
    const contentType = ctx.request.headers.get("content-type") || "";
    
    let cvClientIp: string;
    let frameData: Uint8Array;

    if (contentType.includes("application/json")) {
      // JSON 格式，包含 base64 编码的图像
      const body = await ctx.request.body.json();
      cvClientIp = body.cvClientIp;
      
      // 解码 base64
      const base64Data = body.frame.replace(/^data:image\/jpeg;base64,/, "");
      frameData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    } else if (contentType.includes("multipart/form-data")) {
      // Multipart 格式
      const formData = await ctx.request.body.formData();
      cvClientIp = formData.get("cvClientIp") as string;
      const frameFile = formData.get("frame") as File;
      frameData = new Uint8Array(await frameFile.arrayBuffer());
    } else {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Unsupported content type" };
      return;
    }

    // 查找关联此 CV 客户端的普通客户端
    const client = Object.values(clientManager.clients).find(
      (c) => c.cvClient?.ip === cvClientIp,
    );

    if (!client || !client.cvClient) {
      ctx.response.status = 404;
      ctx.response.body = { success: false, error: "CV client not found" };
      return;
    }

    // 更新 latest_frame
    client.cvClient.latest_frame = frameData;

    ctx.response.body = {
      success: true,
      data: { frameSize: frameData.length },
    };
  } catch (error) {
    console.error("[CV Upload] Error uploading frame:", error);
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: "Internal server error" };
  }
});

/**
 * MJPEG 流端点：实时显示 CV 客户端的图像流
 * GET /api/cv/stream/:cvClientIp
 */
cvRouter.get("/stream/:cvClientIp", (ctx) => {
  const cvClientIp = ctx.params.cvClientIp;

  // 查找关联此 CV 客户端的普通客户端
  const client = Object.values(clientManager.clients).find(
    (c) => c.cvClient?.ip === cvClientIp,
  );

  if (!client || !client.cvClient) {
    ctx.response.status = 404;
    ctx.response.body = "CV client not found";
    return;
  }

  // 设置 MJPEG 流响应头
  ctx.response.headers.set("Content-Type", "multipart/x-mixed-replace; boundary=frame");
  ctx.response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  ctx.response.headers.set("Pragma", "no-cache");
  ctx.response.headers.set("Expires", "0");

  // 创建响应体流
  const body = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      // 定期发送帧
      const intervalId = setInterval(() => {
        try {
          const frame = client.cvClient?.latest_frame;
          
          if (frame && frame.length > 0) {
            // 发送 MJPEG 帧
            const header = encoder.encode(
              `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`
            );
            controller.enqueue(header);
            controller.enqueue(frame);
            controller.enqueue(encoder.encode("\r\n"));
          }
        } catch (error) {
          console.error("[CV Stream] 发送帧失败:", error);
        }
      }, 100); // 每100ms发送一次，即10fps

      // 清理逻辑（当客户端断开连接时）
      // Note: Oak's ReadableStream doesn't have a cancel callback,
      // but the interval will be cleaned up when the response ends
      return () => {
        clearInterval(intervalId);
      };
    },
  });

  ctx.response.body = body;
});

/**
 * 装接评估：接收图片和推理结果
 * POST /api/cv/upload_wiring
 * 
 * 请求体：
 * {
 *   "cvClientIp": "192.168.1.200",
 *   "image": "base64_encoded_image_or_url",
 *   "result": {
 *     "sleeves_num": 10,
 *     "cross_num": 2,
 *     "excopper_num": 1
 *   }
 * }
 */
cvRouter.post("/upload_wiring", async (ctx) => {
  try {
    const body = await ctx.request.body.json();
    const { cvClientIp, image, result } = body;

    // 查找关联此CV客户端的普通客户端
    const client = Object.values(clientManager.clients).find(
      (c) => c.cvClient?.ip === cvClientIp,
    );

    if (!client) {
      ctx.response.status = 404;
      ctx.response.body = { success: false, error: "Client not found for CV client" };
      return;
    }

    if (!client.cvClient?.session) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "No active CV session" };
      return;
    }

    if (client.cvClient.session.type !== "evaluate_wiring") {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Wrong session type" };
      return;
    }

    const session = client.cvClient.session as EvaluateWiringSession;

    // 添加新的拍摄记录
    const shot: WiringShot = {
      timestamp: getSecondTimestamp(),
      image,
      result: {
        sleeves_num: result.sleeves_num || 0,
        cross_num: result.cross_num || 0,
        excopper_num: result.excopper_num || 0,
      },
    };

    session.shots.push(shot);

    console.log(
      `[CV Upload] Received wiring shot from ${cvClientIp} for client ${client.id}, total shots: ${session.shots.length}`,
    );

    ctx.response.body = {
      success: true,
      data: { shotCount: session.shots.length },
    };
  } catch (error) {
    console.error("[CV Upload] Error processing wiring upload:", error);
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: "Internal server error" };
  }
});

/**
 * 装接评估：确认并计算最终结果
 * POST /api/cv/confirm_wiring
 * 
 * 请求体：
 * {
 *   "cvClientIp": "192.168.1.200"
 * }
 */
cvRouter.post("/confirm_wiring", async (ctx) => {
  try {
    const body = await ctx.request.body.json();
    const { cvClientIp } = body;

    // 查找关联此CV客户端的普通客户端
    const client = Object.values(clientManager.clients).find(
      (c) => c.cvClient?.ip === cvClientIp,
    );

    if (!client) {
      ctx.response.status = 404;
      ctx.response.body = { success: false, error: "Client not found for CV client" };
      return;
    }

    if (!client.cvClient?.session) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "No active CV session" };
      return;
    }

    if (client.cvClient.session.type !== "evaluate_wiring") {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Wrong session type" };
      return;
    }

    const session = client.cvClient.session as EvaluateWiringSession;

    // 计算最终结果
    const totalSleeves = session.shots.reduce(
      (sum, shot) => sum + shot.result.sleeves_num,
      0,
    );
    const totalCross = session.shots.reduce(
      (sum, shot) => sum + shot.result.cross_num,
      0,
    );
    const totalExcopper = session.shots.reduce(
      (sum, shot) => sum + shot.result.excopper_num,
      0,
    );

    // 简单的评分算法（可根据实际需求调整）
    // 假设：每个未标号码管扣5分，每个交叉扣3分，每个露铜扣2分
    const totalPoints = 100;
    const deduction = totalSleeves * 5 + totalCross * 3 + totalExcopper * 2;
    const scores = Math.max(0, totalPoints - deduction);

    session.finalResult = {
      no_sleeves_num: totalSleeves,
      cross_num: totalCross,
      excopper_num: totalExcopper,
      scores,
    };

    console.log(
      `[CV Upload] Wiring evaluation completed for client ${client.id}, score: ${scores}`,
    );

    // 发送结果给ESP32客户端
    if (client.socket && client.socket.readyState === WebSocket.OPEN) {
      const responseMsg: EvaluateWiringYoloResponseMessage = {
        type: "evaluate_wiring_yolo_response",
        timestamp: getSecondTimestamp(),
        result: session.finalResult,
      };
      clientManager.safeSend(client.socket, responseMsg);
    }

    // 清除会话
    client.cvClient.session = undefined;

    ctx.response.body = {
      success: true,
      data: session.finalResult,
    };
  } catch (error) {
    console.error("[CV Upload] Error confirming wiring evaluation:", error);
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: "Internal server error" };
  }
});

/**
 * 人脸签到：接收识别结果
 * POST /api/cv/upload_face
 * 
 * 请求体：
 * {
 *   "cvClientIp": "192.168.1.200",
 *   "who": "张三",
 *   "image": "base64_encoded_image_or_url"
 * }
 */
cvRouter.post("/upload_face", async (ctx) => {
  try {
    const body = await ctx.request.body.json();
    const { cvClientIp, who, image } = body;

    // 查找关联此CV客户端的普通客户端
    const client = Object.values(clientManager.clients).find(
      (c) => c.cvClient?.ip === cvClientIp,
    );

    if (!client) {
      ctx.response.status = 404;
      ctx.response.body = { success: false, error: "Client not found for CV client" };
      return;
    }

    if (!client.cvClient?.session) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "No active CV session" };
      return;
    }

    if (client.cvClient.session.type !== "face_signin") {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Wrong session type" };
      return;
    }

    const session = client.cvClient.session as FaceSigninSession;

    // 设置最终结果
    session.finalResult = {
      who,
      image,
    };

    console.log(
      `[CV Upload] Face signin completed for client ${client.id}, identified: ${who}`,
    );

    // 发送结果给ESP32客户端
    if (client.socket && client.socket.readyState === WebSocket.OPEN) {
      const responseMsg: FaceSigninResponseMessage = {
        type: "face_signin_response",
        timestamp: getSecondTimestamp(),
        who: session.finalResult.who,
        image: session.finalResult.image,
      };
      clientManager.safeSend(client.socket, responseMsg);
    }

    // 清除会话
    client.cvClient.session = undefined;

    ctx.response.body = {
      success: true,
      data: session.finalResult,
    };
  } catch (error) {
    console.error("[CV Upload] Error processing face signin:", error);
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: "Internal server error" };
  }
});

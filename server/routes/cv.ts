import { Router } from "@oak/oak";
import { clientManager } from "../ClientManager.ts";
import {
  EvaluateWiringSession,
  EvaluateWiringYoloResponseMessage,
  FaceSigninResponseMessage,
  FaceSigninSession,
  getSecondTimestamp,
  WiringShot,
} from "../types.ts";
import { detectObjects } from "../model.ts";

/**
 * CV上传路由
 * 处理来自ESP32-CAM或Jetson Nano的图片上传和推理结果
 */
export const cvRouter = new Router({ prefix: "/cv" });

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
  ctx.response.headers.set(
    "Content-Type",
    "multipart/x-mixed-replace; boundary=frame",
  );
  ctx.response.headers.set(
    "Cache-Control",
    "no-cache, no-store, must-revalidate",
  );
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
              `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`,
            );
            controller.enqueue(header);
            controller.enqueue(frame);
            controller.enqueue(encoder.encode("\r\n"));
          }
        } catch (error) {
          console.error("[CV Stream] 发送帧失败:", error);
        }
      }, 200); // 每200ms发送一次，即5fps

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
 *   "image?": "base64_encoded_image_or_url",
 *   "result?": {
 *     "sleeves_num": 10,
 *     "cross_num": 2,
 *     "excopper_num": 1
 *   }
 * }
 */
cvRouter.post("/upload_wiring", async (ctx) => {
  // 1. 检查 Body 类型并读取 formData
  const body = ctx.request.body;
  if (body.type() !== "form-data") {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: "必须使用 multipart/form-data",
    };
    return;
  }
  const formData = await body.formData();

  const inputImageFile = formData.get("image"); // 对应客户端 files={'image': ...}
  const inputResultStr = formData.get("result"); // 对应客户端 data={'result': ...}

  if (!inputImageFile || !(inputImageFile instanceof File)) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "未上传图片文件" };
    return;
  }

  const cvClientIp: string = ctx.request.ip;

  // 查找关联此CV客户端的普通客户端
  const client = Object.values(clientManager.clients).find(
    (c) => c.cvClient?.ip === cvClientIp,
  );

  if (!client) {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: "找不到当前视觉客户端，所对应的普通客户端",
    };
    return;
  }

  if (!client.cvClient?.session) {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: "当前视觉客户端没有活跃会话，没有需要拍的",
    };
    return;
  }

  if (client.cvClient.session.type !== "evaluate_wiring") {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: "错误会话类型，现在没在进行装接评估",
    };
    return;
  }

  const session = client.cvClient.session as EvaluateWiringSession;

  if (session.shots.length >= 3) {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: "已经接收了3张照片，不能再接收更多",
    };
    return;
  }

  const resultObj: {
    sleeves_num: number,
    cross_num: number,
    excopper_num: number,
    exterminal_num: number
  } = inputResultStr ? JSON.parse(inputResultStr as string) : {};

  // 将 File 转为 Uint8Array 供后续处理
  const inputImageBuffer = new Uint8Array(await inputImageFile.arrayBuffer());

  // 如果没有 result，使用服务端推理
  let annotatedImageBuffer: Uint8Array | undefined;
  if (!resultObj || Object.keys(resultObj).length === 0) {
    console.log("[CV Upload] 没有推理结果，使用服务端 YOLO 推理");
    // 调用 YOLO 推理（返回结果和带标注的图像）
    const detectionResult = await detectObjects(inputImageBuffer);
    annotatedImageBuffer = detectionResult.annotatedImage;
    resultObj.sleeves_num = detectionResult.sleeves_num;
    resultObj.cross_num = detectionResult.cross_num;
    resultObj.excopper_num = detectionResult.excopper_num;
    resultObj.exterminal_num = detectionResult.exterminal_num;
    console.log("[CV Upload] 服务端推理完成:", detectionResult);
  }

  // 将图像转换为 string - 优先使用带标注的图像
  const base64 = btoa(
    String.fromCharCode(...(annotatedImageBuffer || inputImageBuffer)),
  );
  const frameString: string = `data:image/jpeg;base64,${base64}`;

  // 添加新的拍摄记录
  const shot: WiringShot = {
    timestamp: getSecondTimestamp(),
    image: frameString,
    result: {
      sleeves_num: resultObj.sleeves_num,
      cross_num: resultObj.cross_num,
      excopper_num: resultObj.excopper_num,
      exterminal_num: resultObj.exterminal_num
    },
  };

  session.shots.push(shot);

  console.log(
    `[CV Upload] 已存储装接评估拍摄记录，客户端 ${client.id}，当前已拍 ${session.shots.length} 张`,
  );

  ctx.response.body = {
    success: true,
    data: shot.result
  };
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
cvRouter.post("/confirm_wiring", (ctx) => {
  try {
    const cvClientIp: string = ctx.request.ip;

    // 查找关联此CV客户端的普通客户端
    const client = Object.values(clientManager.clients).find(
      (c) => c.cvClient?.ip === cvClientIp,
    );

    if (!client) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "找不到当前视觉客户端，所对应的普通客户端",
      };
      return;
    }

    if (!client.cvClient?.session) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "当前视觉客户端没有活跃会话，没有要做的",
      };
      return;
    }

    if (client.cvClient.session.type !== "evaluate_wiring") {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "错误会话类型，现在没在进行装接评估",
      };
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
    const totalExterminal = session.shots.reduce(
      (sum, shot) => sum + shot.result.exterminal_num,
      0,
    );

    const OVERALL_SLEEVES_NEEDED = 20 * 2.8; // 总共需要标20个号码管，拍三张照片

    // 简单的评分算法（可根据实际需求调整）
    // 假设：每个未标号码管扣5分，每个交叉扣3分，每个露铜扣2分
    const totalPoints = 100;
    const noSleevesDeduction = Math.max(
      0,
      OVERALL_SLEEVES_NEEDED - totalSleeves,
    );
    const deduction = noSleevesDeduction * 5 + totalCross * 10 +
      totalExcopper * 5 + totalExterminal * 5;
    const scores = Math.max(0, totalPoints - deduction);

    session.finalResult = {
      no_sleeves_num: noSleevesDeduction,
      cross_num: totalCross,
      excopper_num: totalExcopper,
      exterminal_num: totalExterminal,
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
    const { who, image } = body;

    const cvClientIp: string = ctx.request.ip;

    // 查找关联此CV客户端的普通客户端
    const client = Object.values(clientManager.clients).find(
      (c) => c.cvClient?.ip === cvClientIp,
    );

    if (!client) {
      ctx.response.status = 404;
      ctx.response.body = {
        success: false,
        error: "Client not found for CV client",
      };
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
      };
      clientManager.safeSend(client.socket, responseMsg);
    }

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

/**
 * 清除 CV 客户端上的会话
 * POST /api/cv/clear_session/:cvClientIp
 */
cvRouter.post("/clear_session/:cvClientIp", (ctx) => {
  try {
    const cvClientIp = ctx.params.cvClientIp;

    if (!cvClientIp) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "需要 cvClientIp" };
      return;
    }

    // 查找关联此 CV 客户端的普通客户端
    const client = Object.values(clientManager.clients).find(
      (c) => c.cvClient?.ip === cvClientIp,
    );

    if (!client) {
      ctx.response.status = 404;
      ctx.response.body = { success: false, error: "找不到对应的普通客户端" };
      return;
    }

    if (!client.cvClient?.session) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "当前视觉客户端没有活跃会话",
      };
      return;
    }

    // 删除会话（清空当前 session）
    delete client.cvClient.session;

    console.log(
      `[CV] Cleared session for CV client ${cvClientIp} (client ${client.id})`,
    );

    ctx.response.body = { success: true };
  } catch (error) {
    console.error("[CV] Error clearing session:", error);
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: "Internal server error" };
  }
});

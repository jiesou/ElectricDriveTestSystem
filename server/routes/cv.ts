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
  const client = clientManager.findClientByCvIp(cvClientIp);

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
  let intervalId: number | null = null;

  const body = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // 定期发送帧
      intervalId = setInterval(() => {
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
        } catch (_error) {
          // 流已关闭或其他错误，停止发送
          if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }
      }, 200); // 每200ms发送一次，即5fps
    },
    cancel() {
      // 客户端断开连接时清理
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
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
  const inputPositionRaw = formData.get("position"); // 图片位置数据
  const position = inputPositionRaw ? Number(inputPositionRaw) : undefined;

  if (!inputImageFile || !(inputImageFile instanceof File)) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "未上传图片文件" };
    return;
  }

  // 校验 position 参数
  if (!position || ![1, 2, 3].includes(position)) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "需要有效的 position 参数 (1|2|3)" };
    return;
  }

  const cvClientIp: string = ctx.request.ip;

  // 查找关联此 CV 客户端的普通客户端（只有一个时自动绑定）
  const client = clientManager.findClientByCvIp(cvClientIp);

  if (!client) {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: "找不到当前视觉客户端，所对应的普通客户端",
    };
    return;
  }

  if (!client.cvClient) {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: "当前普通客户端没有绑定视觉客户端信息",
    };
    return;
  }

  if (!client.cvClient?.session) {
    // 没有活跃会话则自动创建

      // 创建装接评估会话
      const session: EvaluateWiringSession = {
        type: "evaluate_wiring",
        startTime: getSecondTimestamp(),
        shots: [],
      };
      client.cvClient.session = session;

    // ctx.response.status = 400;
    // ctx.response.body = {
    //   success: false,
    //   error: "当前视觉客户端没有活跃会话，没有需要拍的",
    // };
    // return;
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

  // 允许覆盖指定 position 的照片（1/2/3）。如果之前已有记录则覆盖。
  const inputResultObj: {
    sleeves_num: number,
    cross_num: number,
    excopper_num: number,
    exterminal_num: number
  } = inputResultStr ? JSON.parse(inputResultStr as string) : {};

  // 将 File 转为 Uint8Array 供后续处理
  const inputImageBuffer = new Uint8Array(await inputImageFile.arrayBuffer());

  // 如果没有 result，使用服务端推理。注意：当使用服务端推理时，需要按 position 做特殊处理。
  let annotatedImageBuffer: Uint8Array | undefined;
  let serverDetectionResult: {
    annotatedImage?: Uint8Array;
    sleeves_num?: number;
    cross_num?: number;
    excopper_num?: number;
    exterminal_num?: number;
  } = {};

  const usingServerInference = !inputResultObj || Object.keys(inputResultObj).length === 0;
  if (usingServerInference) {
    console.log("[CV Upload] 没有推理结果，使用服务端 YOLO 推理");
    // 调用 YOLO 推理（返回结果和带标注的图像）
    serverDetectionResult = await detectObjects(inputImageBuffer);
    annotatedImageBuffer = serverDetectionResult.annotatedImage;
    console.log("[CV Upload] 服务端推理完成:", serverDetectionResult);
  }

  // 将图像转换为 string - 优先使用带标注的图像
  // 避免对大型 Uint8Array 使用扩展运算符导致栈溢出，采用分块拼接方式
  const bytes = annotatedImageBuffer || inputImageBuffer;
  let binary = "";
  const CHUNK_SIZE = 0x8000; // 32K 每块，避免参数过长或栈溢出
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  const base64 = btoa(binary);
  const frameString: string = `data:image/jpeg;base64,${base64}`;

  // 添加拍摄记录，根据每个 position 做单独处理
  let sleeves_num = inputResultObj.sleeves_num ?? serverDetectionResult.sleeves_num ?? 0;
  let cross_num = inputResultObj.cross_num ?? serverDetectionResult.cross_num ?? 0;
  let exterminal_num = inputResultObj.exterminal_num ?? serverDetectionResult.exterminal_num ?? 0;
  const excopper_num = inputResultObj.excopper_num ?? serverDetectionResult.excopper_num ?? 0;

  // 第1张：只记录 cross，terminal 始终为 20，其他为 0
  if (position === 1) {
    // keep cross_num
    sleeves_num = 20; // terminal 始终 20
    exterminal_num = 0;
  }

  // 第2张：只记录 terminal（sleeves_num），其他为 0
  if (position === 2) {
    //keep sleeves_num
    cross_num = 0;
    exterminal_num = 0;
  }

  // 第3张：只记录 exterminal，terminal 始终为 18，其他为 0
  if (position === 3) {
    //keep exterminal_num
    sleeves_num = 18; // terminal 始终 18
    cross_num = 0;
  }

  // 构建拍摄记录并写入指定 position（覆盖已有条目）
  const shot: WiringShot = {
    timestamp: getSecondTimestamp(),
    image: frameString,
    result: {
      sleeves_num,
      cross_num,
      excopper_num,
      exterminal_num,
    },
  };

  const idx = position - 1;
  // 确保 session.shots 有足够长度
  while (session.shots.length <= idx) {
    // 填充空位，避免 sparse holes
    session.shots.push({
      timestamp: 0,
      image: "",
      result: { sleeves_num: 0, cross_num: 0, excopper_num: 0, exterminal_num: 0 },
    });
  }

  // 覆盖对应位置
  session.shots[idx] = shot;

  console.log(
    `[CV Upload] 已存储/覆盖装接评估拍摄记录，客户端 ${client.id}，position=${position}，当前已拍 ${session.shots.length} 张`,
  );

  console.log(shot);

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

    // 查找关联此 CV 客户端的普通客户端（只有一个时自动绑定）
    const client = clientManager.findClientByCvIp(cvClientIp);

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
        error: "当前视觉客户端没有拍过照片，没有工艺评估会话，请先拍照",
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

    const OVERALL_SLEEVES_NEEDED = 20+18+20; // 第一张始终 20，第三张始终 18，中间第二张需要 20

    // 评分算法
    // 每个未标号码管扣2分，交叉扣3分，露铜忽略，露端子扣1分
    const totalPoints = 100;
    const noSleevesDeduction = Math.max(
      0,
      OVERALL_SLEEVES_NEEDED - totalSleeves,
    );
    const deduction = noSleevesDeduction * 2 + totalCross * 3 + totalExterminal * 1;
    const scores = Math.max(76, Math.min(90, totalPoints - deduction)); // 最低76分，最高90分

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
    for (const client of Object.values(clientManager.clients)) {
      if (client.socket && client.socket.readyState === WebSocket.OPEN) {
        const responseMsg: EvaluateWiringYoloResponseMessage = {
          type: "evaluate_wiring_yolo_response",
          timestamp: getSecondTimestamp(),
          result: session.finalResult,
        };
        clientManager.safeSend(client.socket, responseMsg);
      }
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
    const { who, image: _image } = body;

    const cvClientIp: string = ctx.request.ip;

    // 查找关联此 CV 客户端的普通客户端（只有一个时自动绑定）
    const client = clientManager.findClientByCvIp(cvClientIp);

    if (!client) {
      ctx.response.status = 404;
      ctx.response.body = {
        success: false,
        error: "找不到当前视觉客户端，所对应的普通客户端",
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

    // 查找关联此 CV 客户端的普通客户端（只有一个时自动绑定）
    const client = clientManager.findClientByCvIp(cvClientIp);

    if (!client) {
      ctx.response.status = 404;
      ctx.response.body = { success: false, error: "找不到当前视觉客户端，所对应的普通客户端" };
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

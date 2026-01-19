import { Router } from "@oak/oak";
import { clientManager } from "../ClientManager.ts";
import {
  EvaluateWiringSession,
  EvaluateWiringYoloPushMessage,
  FaceSigninResultPushMessage,
  FaceSigninSession,
  getSecondTimestamp,
  WiringShot,
} from "../types.ts";
import { detectObjects } from "../model.ts";
import { imageToDataUrl } from "../utils/image.ts";

/**
 * CV上传路由
 * 处理来自ESP32-CAM或Jetson Nano的图片上传和推理结果
 */
export const cvRouter = new Router({ prefix: "/cv" });

/**
 * MJPEG 流端点：实时显示 CV 客户端的图像流
 * GET /api/cv/stream/:cvClientIp
 * 返回 MJPEG 流
 */
cvRouter.get("/stream/:cvClientIp", (ctx) => {
  const cvClientIp = ctx.params.cvClientIp;
  const clients = clientManager.findClientsByCvIp(cvClientIp);
  const cvClient = clients[0].cvClient!;
  
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
          const frame = cvClient.latest_frame;

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
      }, 100); // 每100ms发送一次，即10fps
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
 * Body (FormData)：
 *   image: File,
 *   position: number (1|2|3) 三张图片拍摄位置
 *   result?: str = '{
 *     "sleeves_num": 10,
 *     "cross_num": 2,
 *     "excopper_num": 1
 *   }'
 * 
 * result 为空则使用服务端推理
 */
cvRouter.post("/upload_wiring", async (ctx) => {
  // 校验请求格式
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
  const inputResultStr = formData.get("result") as string | null; // 对应客户端 data={'result': ...}
  const inputPosition = formData.get("position") as number | null; // 图片位置数据

  if (!inputImageFile || !(inputImageFile instanceof File)) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "未上传图片文件" };
    return;
  }

  if (!inputPosition) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "需要有效的 position 参数 (1|2|3)" };
    return;
  }

  const cvClientIp: string = ctx.request.ip;
  const clients = clientManager.findClientsByCvIp(cvClientIp);
  const cvClient = clients[0].cvClient!;

  // 没有会话就建立
  if (!cvClient.session || cvClient.session.type !== "evaluate_wiring") {
    const session: EvaluateWiringSession = {
      type: "evaluate_wiring",
      startTime: getSecondTimestamp(),
      shots: [],
    };
    cvClient.session = session;
  }

  const session = cvClient.session as EvaluateWiringSession;

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

  // 将图像转换为 base64 data URL（优先使用服务端推理带标注的图像）
  const bytes = annotatedImageBuffer || inputImageBuffer;
  const frameString: string = await imageToDataUrl(bytes, "image/jpeg");

  // 添加拍摄记录，根据每个 position 做单独处理
  let sleeves_num = inputResultObj.sleeves_num ?? serverDetectionResult.sleeves_num ?? 0;
  let cross_num = inputResultObj.cross_num ?? serverDetectionResult.cross_num ?? 0;
  let exterminal_num = inputResultObj.exterminal_num ?? serverDetectionResult.exterminal_num ?? 0;
  const excopper_num = inputResultObj.excopper_num ?? serverDetectionResult.excopper_num ?? 0;

  // 第1张：只记录 cross，terminal 始终为 20，其他为 0
  if (inputPosition === 1) {
    // keep cross_num
    sleeves_num = 20; // terminal 始终 20
    exterminal_num = 0;
  }

  // 第2张：只记录 terminal（sleeves_num），其他为 0
  if (inputPosition === 2) {
    //keep sleeves_num
    cross_num = 0;
    exterminal_num = 0;
  }

  // 第3张：只记录 exterminal，terminal 始终为 18，其他为 0
  if (inputPosition === 3) {
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

  const idx = inputPosition - 1;
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
    `[CV Upload] 已存储/覆盖装接评估拍摄记录，cvClient ${cvClient.ip}，position=${inputPosition}，当前已拍 ${session.shots.length} 张`,
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
 */
cvRouter.post("/confirm_wiring", (ctx) => {
  const cvClientIp: string = ctx.request.ip;
  const clients = clientManager.findClientsByCvIp(cvClientIp);
  const cvClient = clients[0].cvClient!;

  if (!cvClient.session || cvClient.session.type !== "evaluate_wiring") {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: "当前视觉客户端没有拍过照片，没有工艺评估会话，请先拍照",
    };
    return;
  }

  const session = cvClient.session as EvaluateWiringSession;

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
    `[CV Upload] 工艺评估已确认 cvClient ${cvClient.ip}, score: ${scores}`,
  );

  // 发送工艺评估确认结果给相关客户端
  for (const client of clients) {
    const responseMsg: EvaluateWiringYoloPushMessage = {
      type: "evaluate_wiring_yolo_push",
      timestamp: getSecondTimestamp(),
      result: session.finalResult,
    };
    clientManager.sendWSMessage(client.socket, responseMsg);
  }

  ctx.response.body = {
    success: true,
    data: session.finalResult,
  };
});

/**
 * 人脸签到：接收识别结果
 * POST /api/cv/upload_face
 *
 * Body (FormData):
 *   image: File,
 *   who: "张三"
 */
cvRouter.post("/upload_face", async (ctx) => {
  // 校验请求格式
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

  const inputImageFile = formData.get("image") as File; // 对应客户端 files={'image': ...}
  const inputWho = formData.get("who") as string; // 图片位置数据

  if (!inputImageFile || !(inputImageFile instanceof File)) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "未上传图片文件" };
    return;
  }

  const cvClientIp: string = ctx.request.ip;
  const clients = clientManager.findClientsByCvIp(cvClientIp);
  const cvClient = clients[0].cvClient!;

  // 没有会话就建立
  if (!cvClient.session || cvClient.session.type !== "face_signin") {
    const session: FaceSigninSession = {
      type: "face_signin",
      startTime: getSecondTimestamp(),
    };
    cvClient.session = session;
  }

  const session = cvClient.session as FaceSigninSession;

  // 将图片转为 data URL 字符串并写入会话
  const imageDataUrl = await imageToDataUrl(inputImageFile, "image/jpeg");
  session.finalResult = {
    who: inputWho,
    image: imageDataUrl,
  };

  // 发送人脸签到结果给相关客户端
  for (const client of clients) {
    const responseMsg: FaceSigninResultPushMessage = {
      type: "face_signin_result_push",
      timestamp: getSecondTimestamp(),
      who: session.finalResult.who,
    };
    clientManager.sendWSMessage(client.socket, responseMsg);
  }

  ctx.response.body = {
    success: true,
    data: session.finalResult,
  };
});

/**
 * 清除 CV 客户端上的会话
 * POST /api/cv/clear_session/:cvClientIp
 */
cvRouter.post("/clear_session/:cvClientIp", (ctx) => {
  const cvClientIp: string = ctx.request.ip;
  const clients = clientManager.findClientsByCvIp(cvClientIp);
  const cvClient = clients[0].cvClient!;
  // 删除会话（清空当前 session）
  delete cvClient.session;

  console.log(
    `[CV] Cleared session for CV client ${cvClient.ip} (client ${clients[0].ip})`,
  );

  ctx.response.body = {
    success: true
  };
});

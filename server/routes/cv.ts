import { Router } from "@oak/oak";
import { clientManager } from "../ClientManager.ts";
import {
  DeskCleanResult,
  DeskCleanSession,
  EvaluateWiringSession,
  EvaluateWiringYoloPushMessage,
  FaceSigninResultPushMessage,
  FaceSigninSession,
  getSecondTimestamp,
  DeskCleanLog,
  CvClientXiaoxinUpdateMessage,
  XiaoxinStatus,
} from "../types.ts";
import { detectObjects } from "../model.ts";
import { saveUploadedImage } from "../utils/upload.ts";

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
  if (!clients.length) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "未绑定客户机" };
    return;
  }
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
 *   result?: str = '{
 *     "sleeves_num": 10,
 *     "cross_num": 2,
 *     "excopper_num": 1,
 *     "exterminal_num": 0
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

  if (!inputImageFile || !(inputImageFile instanceof File)) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "未上传图片文件" };
    return;
  }

  const cvClientIp: string = ctx.request.ip;
  const clients = clientManager.findClientsByCvIp(cvClientIp);
  if (!clients.length) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "未绑定客户机" };
    return;
  }
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

  // 解析客户端提交的推理结果
  const inputResultObj: {
    sleeves_num: number,
    cross_num: number,
    excopper_num: number,
    exterminal_num: number
  } = inputResultStr ? JSON.parse(inputResultStr as string) : {};

  // 将 File 转为 Uint8Array 供后续处理
  const inputImageBuffer = new Uint8Array(await inputImageFile.arrayBuffer());

  // 如果没有 result，使用服务端推理
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

  // 将图像保存为文件（优先使用服务端推理带标注的图像）
  const bytes = annotatedImageBuffer || inputImageBuffer;
  const imageUrl: string = await saveUploadedImage(bytes, inputImageFile.name);

  const sleeves_num = inputResultObj.sleeves_num ?? serverDetectionResult.sleeves_num ?? 0;
  const cross_num = inputResultObj.cross_num ?? serverDetectionResult.cross_num ?? 0;
  const exterminal_num = inputResultObj.exterminal_num ?? serverDetectionResult.exterminal_num ?? 0;
  const excopper_num = inputResultObj.excopper_num ?? serverDetectionResult.excopper_num ?? 0;

  // 存储拍摄记录（每次仅保留最新一张，新的覆盖旧的）
  session.shots = [{
    timestamp: getSecondTimestamp(),
    image: imageUrl,
    result: { sleeves_num, cross_num, excopper_num, exterminal_num },
  }];

  console.log(
    `[CV Upload] 已存储装接评估拍摄记录，cvClient ${cvClient.ip}`,
  );

  ctx.response.body = {
    success: true,
    data: session.shots[0].result
  };
});

/**
 * 装接评估：确认并计算最终结果
 * POST /api/cv/confirm_wiring
 */
cvRouter.post("/confirm_wiring", (ctx) => {
  const cvClientIp: string = ctx.request.ip;
  const clients = clientManager.findClientsByCvIp(cvClientIp);
  if (!clients.length) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "未绑定客户机" };
    return;
  }
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
  const shot = session.shots[0];
  const { sleeves_num, cross_num, excopper_num, exterminal_num } = shot.result;

  // 评分算法
  // 未标号码管扣2分，交叉扣3分，露铜忽略，露端子扣1分
  // 需要号码管总数由拍得的 sleeves_num 倒推（假设全对则满分，少了才扣）
  const SLEEVES_NEEDED = 60; // 单次拍照需含全部号码管
  const noSleevesDeduction = Math.max(0, SLEEVES_NEEDED - sleeves_num);
  const deduction = noSleevesDeduction * 2 + cross_num * 3 + exterminal_num * 1;
  const scores = Math.max(60, Math.min(100, 100 - deduction));

  session.finalResult = {
    no_sleeves_num: noSleevesDeduction,
    seleeves_num: sleeves_num,
    cross_num,
    excopper_num,
    exterminal_num,
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
  if (!clients.length) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "未绑定客户机" };
    return;
  }
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

  // 将图片保存为文件
  const imageBuffer = new Uint8Array(await inputImageFile.arrayBuffer());
  const imageUrl = await saveUploadedImage(imageBuffer, inputImageFile.name);

  session.finalResult = {
    who: inputWho,
    image: imageUrl,
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
 * 工位清洁：接收清洁结果
 * POST /api/cv/upload_deskclean
 *
 * Body (FormData):
 *   image: File,
 *   result: str = '{"sleeves_num":0,"screwdriver_ready":true,"wire_stripper_ready":true,"multimeter_ready":true,"crimping_ready":true,"clean_progress":0.8}'
 */
cvRouter.post("/upload_deskclean", async (ctx) => {
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

  const inputImageFile = formData.get("image") as File;
  const inputResultStr = formData.get("result") as string | null;

  if (!inputImageFile || !(inputImageFile instanceof File)) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "未上传图片文件" };
    return;
  }

  if (!inputResultStr) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "需要 result 参数" };
    return;
  }

  let inputResultObj: Omit<DeskCleanResult, "image">;
  try {
    inputResultObj = JSON.parse(inputResultStr);
  } catch (_error) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "result 不是合法 JSON" };
    return;
  }

  const cvClientIp: string = ctx.request.ip;
  const clients = clientManager.findClientsByCvIp(cvClientIp);
  if (!clients.length) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "未绑定客户机" };
    return;
  }
  const cvClient = clients[0].cvClient!;

  // 没有会话就建立
  if (!cvClient.session || cvClient.session.type !== "desk_clean") {
    const session: DeskCleanSession = {
      type: "desk_clean",
      startTime: getSecondTimestamp(),
    };
    cvClient.session = session;
  }

  const session = cvClient.session as DeskCleanSession;

  // 将图片保存为文件
  const imageBuffer = new Uint8Array(await inputImageFile.arrayBuffer());
  const imageUrl = await saveUploadedImage(imageBuffer, inputImageFile.name);

  session.finalResult = {
    image: imageUrl,
    sleeves_num: Number(inputResultObj.sleeves_num) || 0,
    screwdriver_ready: Boolean(inputResultObj.screwdriver_ready),
    wire_stripper_ready: Boolean(inputResultObj.wire_stripper_ready),
    multimeter_ready: Boolean(inputResultObj.multimeter_ready),
    crimping_ready: Boolean(inputResultObj.crimping_ready),
    clean_progress: Number(inputResultObj.clean_progress) || 0,
  };

  // 记录日志（工位清洁属于测验考点）
  for (const client of clients) {
    if (!client.testSession) continue;
    const log: DeskCleanLog = {
      timestamp: getSecondTimestamp(),
      action: "desk_clean",
      details: {
        deskCleanResult: session.finalResult,
      },
    };
    client.testSession.logs.push(log);
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
  const cvClientIp: string = ctx.params.cvClientIp;
  const clients = clientManager.findClientsByCvIp(cvClientIp);
  if (!clients.length) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "未绑定客户机" };
    return;
  }
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

/**
 * 小新智能体状态更新（即是否需要 装接故障排除）
 * GET /api/cv/pull_xiaoxin_update
 */
cvRouter.get("/pull_xiaoxin_update", (ctx) => {
  const cvClientIp: string = ctx.request.ip;
  const clients = clientManager.findClientsByCvIp(cvClientIp);
  if (!clients.length) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "未绑定客户机" };
    return;
  }

  // 默认空闲状态不显示内容
  const defaultStatus: XiaoxinStatus = { type: "status_text_update", status_text: "" };

  if (clients.length === 0 || !clients[0].cvClient) {
    ctx.response.body = {
      success: true,
      data: {
        ...defaultStatus,
        timestamp: getSecondTimestamp(),
      } as CvClientXiaoxinUpdateMessage,
    };
    return;
  }

  const cvClient = clients[0].cvClient;
  const xiaoxinStatus = cvClient.xiaoxin_status || defaultStatus;

  const updateMessage: CvClientXiaoxinUpdateMessage = {
    ...xiaoxinStatus,
    timestamp: getSecondTimestamp(),
  };

  ctx.response.body = {
    success: true,
    data: updateMessage,
  };
});

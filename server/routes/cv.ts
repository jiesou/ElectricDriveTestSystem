import { Router } from "@oak/oak";
import { getSecondTimestamp } from "../types.ts";

/**
 * 机器视觉相关路由
 * 处理来自 Jetson Nano 和 ESP32-CAM 的图片上传和推理结果
 */
export const cvRouter = new Router();

/**
 * ESP32-CAM 图片上传接口
 * POST /api/cv/upload_espcam
 * Body: { ip: string, images: string[], results?: any }
 */
cvRouter.post("/cv/upload_espcam", async (ctx) => {
  try {
    const body = await ctx.request.body.json();
    const { ip, images, results } = body;

    if (!ip || !Array.isArray(images)) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Invalid request: ip and images array required",
      };
      return;
    }

    console.log(`[CV] Received ${images.length} images from ESP32-CAM at ${ip}`);
    
    // TODO: 实现处理逻辑
    // 1. 找到对应的 YoloClient (根据 ip)
    // 2. 根据当前 session 类型处理图片
    // 3. 如果需要云端推理，调用 Roboflow API
    // 4. 更新 session 的 shots 数据
    // 5. 检查是否完成，如果完成则生成 final_result 并回传原始客户端

    ctx.response.body = {
      success: true,
      message: "ESP32-CAM upload received (not fully implemented)",
      timestamp: getSecondTimestamp(),
    };
  } catch (error) {
    console.error("[CV] Error handling ESP32-CAM upload:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      error: "Internal server error",
    };
  }
});

/**
 * Jetson Nano 推理结果上传接口
 * POST /api/cv/upload_jetson
 * Body: { ip: string, image: string, result: any }
 */
cvRouter.post("/cv/upload_jetson", async (ctx) => {
  try {
    const body = await ctx.request.body.json();
    const { ip, image, result } = body;

    if (!ip || !image || !result) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Invalid request: ip, image and result required",
      };
      return;
    }

    console.log(`[CV] Received inference result from Jetson Nano at ${ip}`);
    
    // TODO: 实现处理逻辑
    // 1. 找到对应的 YoloClient (根据 ip)
    // 2. 根据当前 session 类型处理结果
    // 3. 更新 session 的 shots 数据或 final_result
    // 4. 如果完成则回传原始客户端

    ctx.response.body = {
      success: true,
      message: "Jetson Nano result received (not fully implemented)",
      timestamp: getSecondTimestamp(),
    };
  } catch (error) {
    console.error("[CV] Error handling Jetson Nano upload:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      error: "Internal server error",
    };
  }
});

/**
 * 获取当前活跃的机器视觉任务状态
 * GET /api/cv/status
 */
cvRouter.get("/cv/status", (ctx) => {
  // TODO: 返回当前所有 YoloClient 和它们的 session 状态
  
  ctx.response.body = {
    success: true,
    data: {
      yoloClients: [],
      activeSessions: [],
    },
    message: "CV status endpoint (not fully implemented)",
  };
});

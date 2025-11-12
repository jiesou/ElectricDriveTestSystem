import { Router } from "@oak/oak";
import { getSecondTimestamp } from "../types.ts";
import { yoloManager } from "../YoloClientManager.ts";
import { manager } from "../TestSystemManager.ts";
import { wsManager } from "../websocket/manager.ts";

/**
 * 机器视觉相关路由
 * 处理来自 Jetson Nano 和 ESP32-CAM 的图片上传和推理结果
 */
export const cvRouter = new Router();

/**
 * ESP32-CAM 图片上传接口
 * POST /api/cv/upload_espcam
 * Body: { ip: string, images: string[], results?: any[] }
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
    
    // 注册或更新 YOLO 客户端
    const yoloClient = yoloManager.registerYoloClient(ip, "espcam");
    
    if (!yoloClient.currentSession) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "No active session for this YOLO client",
      };
      return;
    }

    // 处理上传的图片
    if (yoloClient.currentSession.type === "evaluate_wiring") {
      // 装接评估：添加图片和结果到会话
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const result = results && results[i] ? results[i] : undefined;
        
        try {
          yoloManager.addEvaluateWiringShot(ip, image, result);
        } catch (error) {
          console.error(`[CV] Error adding shot: ${error}`);
        }
      }
      
      // TODO: 如果需要云端推理，这里调用 Roboflow API
      
      ctx.response.body = {
        success: true,
        message: "Images received and processed",
        timestamp: getSecondTimestamp(),
      };
    } else {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Unexpected session type for ESP32-CAM",
      };
    }
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
 * Body: { ip: string, image: string, result: any, session_type?: string }
 */
cvRouter.post("/cv/upload_jetson", async (ctx) => {
  try {
    const body = await ctx.request.body.json();
    const { ip, image, result, session_type } = body;

    if (!ip || !image) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Invalid request: ip and image required",
      };
      return;
    }

    console.log(`[CV] Received inference result from Jetson Nano at ${ip}`);
    
    // 注册或更新 YOLO 客户端
    const yoloClient = yoloManager.registerYoloClient(ip, "jetson_nano");
    
    if (!yoloClient.currentSession) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "No active session for this YOLO client",
      };
      return;
    }

    // 根据会话类型处理结果
    if (yoloClient.currentSession.type === "evaluate_wiring") {
      // 装接评估
      yoloManager.addEvaluateWiringShot(ip, image, result);
      
      ctx.response.body = {
        success: true,
        message: "Evaluation result received",
        timestamp: getSecondTimestamp(),
      };
    } else if (yoloClient.currentSession.type === "face_signin") {
      // 人脸识别
      if (result && result.who) {
        const session = yoloManager.completeFaceSigninSession(
          ip,
          result.who,
          image,
          result.confidence,
        );
        
        // 找到发起请求的原始客户端并回传结果
        const originalClient = manager.clients[session.clientId];
        if (originalClient && originalClient.socket) {
          wsManager.safeSend(originalClient.socket, {
            type: "face_signin_response",
            result: session.final_result,
            timestamp: getSecondTimestamp(),
          });
        }
        
        ctx.response.body = {
          success: true,
          message: "Face signin completed",
          result: session.final_result,
          timestamp: getSecondTimestamp(),
        };
      } else {
        ctx.response.body = {
          success: true,
          message: "No face detected yet",
          timestamp: getSecondTimestamp(),
        };
      }
    } else {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Unknown session type",
      };
    }
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
 * 确认装接评估完成
 * POST /api/cv/confirm_evaluate_wiring
 * Body: { ip: string }
 */
cvRouter.post("/cv/confirm_evaluate_wiring", async (ctx) => {
  try {
    const body = await ctx.request.body.json();
    const { ip } = body;

    if (!ip) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Invalid request: ip required",
      };
      return;
    }

    // 完成会话
    const session = yoloManager.completeEvaluateWiringSession(ip);
    
    // 找到发起请求的原始客户端并回传结果
    const originalClient = manager.clients[session.clientId];
    if (originalClient && originalClient.socket) {
      wsManager.safeSend(originalClient.socket, {
        type: "evaluate_wiring_yolo_response",
        session,
        timestamp: getSecondTimestamp(),
      });
    }

    ctx.response.body = {
      success: true,
      data: session,
      timestamp: getSecondTimestamp(),
    };
  } catch (error) {
    console.error("[CV] Error confirming evaluate wiring:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    };
  }
});

/**
 * 获取当前活跃的机器视觉任务状态
 * GET /api/cv/status
 */
cvRouter.get("/cv/status", (ctx) => {
  const yoloClients = Object.values(yoloManager.yoloClients).map((client) => ({
    id: client.id,
    name: client.name,
    ip: client.ip,
    type: client.type,
    online: client.online,
    currentSession: client.currentSession ? {
      type: client.currentSession.type,
      clientId: client.currentSession.clientId,
      status: client.currentSession.status,
    } : null,
  }));

  const activeSessions = yoloClients
    .filter((c) => c.currentSession !== null)
    .map((c) => c.currentSession);

  ctx.response.body = {
    success: true,
    data: {
      yoloClients,
      activeSessions,
      onlineCount: yoloClients.filter((c) => c.online).length,
    },
    timestamp: getSecondTimestamp(),
  };
});

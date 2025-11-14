/**
 * CV功能集成测试
 * 测试装接评估和人脸签到功能的基本流程
 */

import { assertEquals, assertExists } from "@std/assert";

const BASE_URL = "http://localhost:8000";
const CV_CLIENT_IP = "192.168.1.200";

// 辅助函数：等待服务器启动
async function waitForServer(maxRetries = 10): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return true;
    } catch (_e) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  return false;
}

Deno.test("CV Upload - 装接评估流程", async () => {
  // 确保服务器运行
  const serverReady = await waitForServer();
  if (!serverReady) {
    console.log("服务器未启动，跳过测试");
    return;
  }

  // 1. 上传第一张图片和推理结果
  const uploadResponse1 = await fetch(`${BASE_URL}/api/cv/upload_wiring`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cvClientIp: CV_CLIENT_IP,
      image: "data:image/png;base64,fake_image_1",
      result: {
        sleeves_num: 8,
        cross_num: 1,
        excopper_num: 0,
      },
    }),
  });

  // 如果客户端未配置，跳过测试
  if (uploadResponse1.status === 404) {
    console.log("CV客户端未配置，跳过测试");
    return;
  }

  assertEquals(uploadResponse1.status, 200);
  const uploadData1 = await uploadResponse1.json();
  assertEquals(uploadData1.success, true);

  // 2. 上传第二张图片和推理结果
  const uploadResponse2 = await fetch(`${BASE_URL}/api/cv/upload_wiring`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cvClientIp: CV_CLIENT_IP,
      image: "data:image/png;base64,fake_image_2",
      result: {
        sleeves_num: 2,
        cross_num: 1,
        excopper_num: 1,
      },
    }),
  });

  assertEquals(uploadResponse2.status, 200);
  const uploadData2 = await uploadResponse2.json();
  assertEquals(uploadData2.success, true);

  // 3. 确认并获取最终结果
  const confirmResponse = await fetch(`${BASE_URL}/api/cv/confirm_wiring`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cvClientIp: CV_CLIENT_IP,
    }),
  });

  assertEquals(confirmResponse.status, 200);
  const confirmData = await confirmResponse.json();
  assertEquals(confirmData.success, true);
  assertExists(confirmData.data);
  
  // 验证计算结果
  const result = confirmData.data;
  assertEquals(result.no_sleeves_num, 10); // 8 + 2
  assertEquals(result.cross_num, 2); // 1 + 1
  assertEquals(result.excopper_num, 1); // 0 + 1
  
  // 评分应该是 100 - (10*5 + 2*3 + 1*2) = 100 - 58 = 42
  assertEquals(result.scores, 42);
});

Deno.test("CV Upload - 人脸签到流程", async () => {
  // 确保服务器运行
  const serverReady = await waitForServer();
  if (!serverReady) {
    console.log("服务器未启动，跳过测试");
    return;
  }

  // 上传人脸识别结果
  const uploadResponse = await fetch(`${BASE_URL}/api/cv/upload_face`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cvClientIp: CV_CLIENT_IP,
      who: "张三",
      image: "data:image/png;base64,fake_face_image",
    }),
  });

  // 如果客户端未配置，跳过测试
  if (uploadResponse.status === 404) {
    console.log("CV客户端未配置，跳过测试");
    return;
  }

  assertEquals(uploadResponse.status, 200);
  const uploadData = await uploadResponse.json();
  assertEquals(uploadData.success, true);
  assertExists(uploadData.data);
  
  // 验证识别结果
  const result = uploadData.data;
  assertEquals(result.who, "张三");
  assertEquals(result.image, "data:image/png;base64,fake_face_image");
});

Deno.test("API - 获取客户端列表（含cvClient信息）", async () => {
  const serverReady = await waitForServer();
  if (!serverReady) {
    console.log("服务器未启动，跳过测试");
    return;
  }

  const response = await fetch(`${BASE_URL}/api/clients`);
  assertEquals(response.status, 200);
  
  const data = await response.json();
  assertEquals(data.success, true);
  assertExists(data.data);
});

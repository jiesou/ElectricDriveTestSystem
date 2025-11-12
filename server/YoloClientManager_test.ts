import { assertEquals, assertExists } from "@std/assert";
import { yoloManager } from "./YoloClientManager.ts";
import { getSecondTimestamp, EvaluateWiringSession } from "./types.ts";

/**
 * YoloClientManager 集成测试
 */

Deno.test("YoloClientManager - 注册 ESP32-CAM 客户端", () => {
  const ip = "192.168.1.100";
  const client = yoloManager.registerYoloClient(ip, "espcam");
  
  assertExists(client.id);
  assertEquals(client.ip, ip);
  assertEquals(client.type, "espcam");
  assertEquals(client.online, true);
});

Deno.test("YoloClientManager - 注册 Jetson Nano 客户端", () => {
  const ip = "192.168.1.101";
  const client = yoloManager.registerYoloClient(ip, "jetson_nano");
  
  assertExists(client.id);
  assertEquals(client.ip, ip);
  assertEquals(client.type, "jetson_nano");
  assertEquals(client.online, true);
});

Deno.test("YoloClientManager - 通过 IP 查找客户端", () => {
  const ip = "192.168.1.102";
  yoloManager.registerYoloClient(ip, "espcam");
  
  const found = yoloManager.findYoloClientByIp(ip);
  assertExists(found);
  assertEquals(found?.ip, ip);
});

Deno.test("YoloClientManager - 创建装接评估会话", () => {
  const ip = "192.168.1.103";
  const yoloClient = yoloManager.registerYoloClient(ip, "espcam");
  
  const mockClient = {
    id: "test-client-1",
    name: "Test Client",
    ip: "192.168.1.10",
    online: true,
    lastPing: getSecondTimestamp(),
  };
  
  const session = yoloManager.createEvaluateWiringSession(mockClient, yoloClient);
  
  assertEquals(session.type, "evaluate_wiring");
  assertEquals(session.clientId, mockClient.id);
  assertEquals(session.status, "active");
  assertEquals(session.shots.length, 0);
  assertExists(yoloClient.currentSession);
});

Deno.test("YoloClientManager - 添加装接评估图片", () => {
  const ip = "192.168.1.104";
  const yoloClient = yoloManager.registerYoloClient(ip, "espcam");
  
  const mockClient = {
    id: "test-client-2",
    name: "Test Client 2",
    ip: "192.168.1.11",
    online: true,
    lastPing: getSecondTimestamp(),
  };
  
  yoloManager.createEvaluateWiringSession(mockClient, yoloClient);
  
  yoloManager.addEvaluateWiringShot(ip, "base64_image_data", {
    sleeves_num: 10,
    cross_num: 2,
    excopper_num: 1,
  });
  
  const session = yoloClient.currentSession as EvaluateWiringSession;
  assertExists(session);
  assertEquals(session.type, "evaluate_wiring");
  assertEquals(session.shots.length, 1);
  assertEquals(session.shots[0].result?.sleeves_num, 10);
});

Deno.test("YoloClientManager - 完成装接评估会话", () => {
  const ip = "192.168.1.105";
  const yoloClient = yoloManager.registerYoloClient(ip, "espcam");
  
  const mockClient = {
    id: "test-client-3",
    name: "Test Client 3",
    ip: "192.168.1.12",
    online: true,
    lastPing: getSecondTimestamp(),
  };
  
  yoloManager.createEvaluateWiringSession(mockClient, yoloClient);
  
  // 添加几个评估结果
  yoloManager.addEvaluateWiringShot(ip, "image1", {
    sleeves_num: 10,
    cross_num: 2,
    excopper_num: 1,
  });
  
  yoloManager.addEvaluateWiringShot(ip, "image2", {
    sleeves_num: 8,
    cross_num: 1,
    excopper_num: 0,
  });
  
  const completedSession = yoloManager.completeEvaluateWiringSession(ip);
  
  assertEquals(completedSession.status, "completed");
  assertExists(completedSession.final_result);
  assertExists(completedSession.final_result?.scores);
  assertEquals(completedSession.shots.length, 2);
});

Deno.test("YoloClientManager - 创建人脸签到会话", () => {
  const ip = "192.168.1.106";
  const yoloClient = yoloManager.registerYoloClient(ip, "jetson_nano");
  
  const mockClient = {
    id: "test-client-4",
    name: "Test Client 4",
    ip: "192.168.1.13",
    online: true,
    lastPing: getSecondTimestamp(),
  };
  
  const session = yoloManager.createFaceSigninSession(mockClient, yoloClient);
  
  assertEquals(session.type, "face_signin");
  assertEquals(session.clientId, mockClient.id);
  assertEquals(session.status, "active");
  assertExists(yoloClient.currentSession);
});

Deno.test("YoloClientManager - 完成人脸签到会话", () => {
  const ip = "192.168.1.107";
  const yoloClient = yoloManager.registerYoloClient(ip, "jetson_nano");
  
  const mockClient = {
    id: "test-client-5",
    name: "Test Client 5",
    ip: "192.168.1.14",
    online: true,
    lastPing: getSecondTimestamp(),
  };
  
  yoloManager.createFaceSigninSession(mockClient, yoloClient);
  
  const completedSession = yoloManager.completeFaceSigninSession(
    ip,
    "张三",
    "base64_face_image",
    0.95,
  );
  
  assertEquals(completedSession.status, "completed");
  assertExists(completedSession.final_result);
  assertEquals(completedSession.final_result?.who, "张三");
  assertEquals(completedSession.final_result?.confidence, 0.95);
});

Deno.test("YoloClientManager - 获取在线客户端", () => {
  const onlineClients = yoloManager.getOnlineYoloClients();
  
  // 应该至少有之前测试创建的客户端
  assertEquals(onlineClients.length > 0, true);
  
  for (const client of onlineClients) {
    assertEquals(client.online, true);
  }
});

/**
 * 数据结构和类型测试
 * 验证新增的CV相关类型定义正确
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  CvClient,
  ESPCAMClient,
  JetsonNanoClient,
  EvaluateWiringSession,
  FaceSigninSession,
  CV_CLIENT_MAP,
  getSecondTimestamp,
} from "./types.ts";

Deno.test("getSecondTimestamp返回正确的秒级时间戳", () => {
  const timestamp = getSecondTimestamp();
  
  // 验证是整数
  assertEquals(timestamp % 1, 0);
  
  // 验证是合理的时间戳（2020年之后）
  const year2020 = 1577836800; // 2020-01-01 00:00:00 UTC
  assertEquals(timestamp > year2020, true);
});

Deno.test("CV_CLIENT_MAP正确加载配置", () => {
  assertExists(CV_CLIENT_MAP);
  assertEquals(Array.isArray(CV_CLIENT_MAP), true);
  
  // 如果有配置，验证结构
  if (CV_CLIENT_MAP.length > 0) {
    const mapping = CV_CLIENT_MAP[0];
    assertExists(mapping.clientIp);
    assertExists(mapping.cvClientIp);
    assertExists(mapping.cvClientType);
    assertEquals(
      mapping.cvClientType === "esp32cam" || mapping.cvClientType === "jetson_nano",
      true
    );
  }
});

Deno.test("EvaluateWiringSession数据结构", () => {
  const session: EvaluateWiringSession = {
    type: "evaluate_wiring",
    startTime: getSecondTimestamp(),
    shots: [
      {
        timestamp: getSecondTimestamp(),
        image: "base64_image",
        result: {
          sleeves_num: 10,
          cross_num: 2,
          excopper_num: 1,
        },
      },
    ],
  };

  assertEquals(session.type, "evaluate_wiring");
  assertEquals(session.shots.length, 1);
  assertEquals(session.shots[0].result.sleeves_num, 10);
  
  // 添加finalResult
  session.finalResult = {
    no_sleeves_num: 10,
    cross_num: 2,
    excopper_num: 1,
    scores: 85,
  };
  
  assertExists(session.finalResult);
  assertEquals(session.finalResult.scores, 85);
});

Deno.test("FaceSigninSession数据结构", () => {
  const session: FaceSigninSession = {
    type: "face_signin",
    startTime: getSecondTimestamp(),
  };

  assertEquals(session.type, "face_signin");
  
  // 添加finalResult
  session.finalResult = {
    who: "张三",
    image: "base64_face_image",
  };
  
  assertExists(session.finalResult);
  assertEquals(session.finalResult.who, "张三");
});

Deno.test("ESPCAMClient数据结构", () => {
  const cvClient: ESPCAMClient = {
    clientType: "esp32cam",
    ip: "192.168.1.200",
  };

  assertEquals(cvClient.clientType, "esp32cam");
  assertEquals(cvClient.ip, "192.168.1.200");
});

Deno.test("JetsonNanoClient数据结构", () => {
  const cvClient: JetsonNanoClient = {
    clientType: "jetson_nano",
    ip: "192.168.1.201",
  };

  assertEquals(cvClient.clientType, "jetson_nano");
  assertEquals(cvClient.ip, "192.168.1.201");
});

Deno.test("CvClient可以持有不同类型的Session", () => {
  const cvClient: CvClient = {
    clientType: "esp32cam",
    ip: "192.168.1.200",
  };

  // 添加装接评估会话
  cvClient.session = {
    type: "evaluate_wiring",
    startTime: getSecondTimestamp(),
    shots: [],
  };
  
  assertEquals(cvClient.session.type, "evaluate_wiring");
  
  // 切换为人脸签到会话
  cvClient.session = {
    type: "face_signin",
    startTime: getSecondTimestamp(),
  };
  
  assertEquals(cvClient.session.type, "face_signin");
});

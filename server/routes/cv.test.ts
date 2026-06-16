import { assertEquals, assert, assertExists } from "@std/assert";
import {
  getSecondTimestamp,
  EvaluateWiringSession,
  FaceSigninSession,
  DeskCleanSession,
  DeskCleanResult,
  DeskCleanLog,
  CvClient,
  TestSession,
} from "../types.ts";

// 评分算法（同 cv.ts lines 237-240）
function calcWiringScore(sleeves_num: number, cross_num: number, exterminal_num: number): number {
  const SLEEVES_NEEDED = 60;
  const noSleevesDeduction = Math.max(0, SLEEVES_NEEDED - sleeves_num);
  const deduction = noSleevesDeduction * 2 + cross_num * 3 + exterminal_num * 1;
  return Math.max(60, Math.min(100, 100 - deduction));
}

Deno.test("评分算法 - 满分: 60个号码管且无问题", () => {
  assertEquals(calcWiringScore(60, 0, 0), 100);
});

Deno.test("评分算法 - 缺少号码管扣分: 50个=10未标*2=扣20", () => {
  assertEquals(calcWiringScore(50, 0, 0), 80);
});

Deno.test("评分算法 - 交叉接线扣分: 5个*3=扣15", () => {
  assertEquals(calcWiringScore(60, 5, 0), 85);
});

Deno.test("评分算法 - 露端子扣分: 10个*1=扣10", () => {
  assertEquals(calcWiringScore(60, 0, 10), 90);
});

Deno.test("评分算法 - 露铜不扣分综合: 40管+5交叉+2端子=57扣分保底60", () => {
  assertEquals(calcWiringScore(40, 5, 2), 60);
});

Deno.test("评分算法 - 保底最低60分", () => {
  assertEquals(calcWiringScore(0, 20, 30), 60);
});

Deno.test("评分算法 - 封顶最高100分", () => {
  assertEquals(calcWiringScore(65, 0, 0), 100);
});

// Xiaoxin 状态逻辑（同 cv.ts lines 481-501）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getXiaoxinStatus(cvClient?: { xiaoxin_status?: any }) {
  const defaultStatus = { type: "status_text_update", status_text: "" };
  if (!cvClient) return { ...defaultStatus };
  return { ...(cvClient.xiaoxin_status || defaultStatus) };
}

Deno.test("Xiaoxin状态 - 无cvClient返回默认空闲", () => {
  const s = getXiaoxinStatus(undefined);
  assertEquals(s.type, "status_text_update");
  assertEquals(s.status_text, "");
});

Deno.test("Xiaoxin状态 - 无xiaoxin_status返回默认", () => {
  const s = getXiaoxinStatus({});
  assertEquals(s.type, "status_text_update");
  assertEquals(s.status_text, "");
});

Deno.test("Xiaoxin状态 - 返回M1_NOT_START", () => {
  const s = getXiaoxinStatus({
    xiaoxin_status: { type: "evaluate_need_troubleshoot", evaluate_need_troubleshoot_type: "M1_NOT_START" },
  });
  assertEquals(s.type, "evaluate_need_troubleshoot");
  assertEquals(s.evaluate_need_troubleshoot_type, "M1_NOT_START");
});

Deno.test("Xiaoxin状态 - 返回M2_NOT_START", () => {
  const s = getXiaoxinStatus({
    xiaoxin_status: { type: "evaluate_need_troubleshoot", evaluate_need_troubleshoot_type: "M2_NOT_START" },
  });
  assertEquals(s.type, "evaluate_need_troubleshoot");
  assertEquals(s.evaluate_need_troubleshoot_type, "M2_NOT_START");
});

Deno.test("会话管理 - 创建装接评估会话", () => {
  const s: EvaluateWiringSession = { type: "evaluate_wiring", startTime: getSecondTimestamp(), shots: [] };
  assertEquals(s.type, "evaluate_wiring");
  assertEquals(s.shots.length, 0);
});

Deno.test("会话管理 - 创建人脸签到会话", () => {
  const s: FaceSigninSession = { type: "face_signin", startTime: getSecondTimestamp() };
  assertEquals(s.type, "face_signin");
  assertExists(s.startTime);
});

Deno.test("会话管理 - 创建工位清洁会话", () => {
  const s: DeskCleanSession = { type: "desk_clean", startTime: getSecondTimestamp() };
  assertEquals(s.type, "desk_clean");
  assertExists(s.startTime);
});

Deno.test("会话管理 - 清除会话（delete cvClient.session）", () => {
  const cv: CvClient = {
    clientType: "jetson_nano",
    ip: "10.0.0.1",
    session: { type: "evaluate_wiring", startTime: getSecondTimestamp(), shots: [] },
  };
  assertExists(cv.session);
  delete cv.session;
  assertEquals(cv.session, undefined);
});

Deno.test("拍摄记录 - 新的覆盖旧的（仅保留最新一张）", () => {
  const s: EvaluateWiringSession = { type: "evaluate_wiring", startTime: getSecondTimestamp(), shots: [] };

  s.shots = [{
    timestamp: getSecondTimestamp(), image: "/uploads/first.jpg",
    result: { sleeves_num: 50, cross_num: 2, excopper_num: 0, exterminal_num: 1 },
  }];
  assertEquals(s.shots.length, 1);

  s.shots = [{
    timestamp: getSecondTimestamp(), image: "/uploads/second.jpg",
    result: { sleeves_num: 60, cross_num: 0, excopper_num: 0, exterminal_num: 0 },
  }];
  assertEquals(s.shots.length, 1);
  assertEquals(s.shots[0].image, "/uploads/second.jpg");
  assertEquals(s.shots[0].result.sleeves_num, 60);
});

Deno.test("拍摄记录 - 结果字段完整可用于评分计算", () => {
  const s: EvaluateWiringSession = { type: "evaluate_wiring", startTime: getSecondTimestamp(), shots: [] };
  s.shots = [{
    timestamp: getSecondTimestamp(), image: "/uploads/test.jpg",
    result: { sleeves_num: 55, cross_num: 3, excopper_num: 2, exterminal_num: 1 },
  }];
  const { sleeves_num, cross_num, exterminal_num } = s.shots[0].result;
  // (60-55)*2 + 3*3 + 1*1 = 20 -> 100-20 = 80
  assertEquals(calcWiringScore(sleeves_num, cross_num, exterminal_num), 80);
});

Deno.test("工位清洁日志 - 有testSession时创建DeskCleanLog", () => {
  const now = getSecondTimestamp();
  const result: DeskCleanResult = {
    image: "/uploads/clean.jpg", sleeves_num: 1,
    screwdriver_ready: true, wire_stripper_ready: true,
    multimeter_ready: false, crimping_ready: true, clean_progress: 0.85,
  };
  const log: DeskCleanLog = { timestamp: now, action: "desk_clean", details: { deskCleanResult: result } };
  assertEquals(log.action, "desk_clean");
  assertEquals(log.details.deskCleanResult.clean_progress, 0.85);
  assertEquals(log.details.deskCleanResult.screwdriver_ready, true);

  const ts: TestSession = { id: "s1", test: { id: 1, questions: [], startTime: now, durationTime: null }, logs: [] };
  ts.logs.push(log);
  assertEquals(ts.logs.length, 1);
  assertEquals(ts.logs[0].action, "desk_clean");
});

Deno.test("工位清洁日志 - clean_progress边界值0和1", () => {
  const log0: DeskCleanLog = {
    timestamp: getSecondTimestamp(), action: "desk_clean",
    details: { deskCleanResult: { image: "", sleeves_num: 0, screwdriver_ready: false, wire_stripper_ready: false, multimeter_ready: false, crimping_ready: false, clean_progress: 0 } },
  };
  assertEquals(log0.details.deskCleanResult.clean_progress, 0);

  const log1: DeskCleanLog = {
    timestamp: getSecondTimestamp(), action: "desk_clean",
    details: { deskCleanResult: { image: "", sleeves_num: 0, screwdriver_ready: true, wire_stripper_ready: true, multimeter_ready: true, crimping_ready: true, clean_progress: 1 } },
  };
  assertEquals(log1.details.deskCleanResult.clean_progress, 1);
});

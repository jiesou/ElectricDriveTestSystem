import { assertEquals, assert } from "@std/assert";
import { formatLogEntry, buildPrompt } from "./generator.ts";
import type { Client, StartLog, AnswerLog, FinishLog, ConnectLog, DisconnectLog, DeskCleanLog } from "../types.ts";

Deno.test("formatLogEntry - start 类型", () => {
  const log: StartLog = {
    timestamp: 1000000000, action: "start",
    details: { question: { id: 42, troubles: [] } },
  };
  const result = formatLogEntry(log, 0);
  assert(result.startsWith("1. ["));
  assert(result.includes("] START: 开始测验 - 题目: 42"));
});

Deno.test("formatLogEntry - answer 正确", () => {
  const log: AnswerLog = {
    timestamp: 1000000000, action: "answer",
    details: {
      question: { id: 1, troubles: [] },
      trouble: { id: 3, description: "103 和 104 断路", from_wire: 103, to_wire: 104 },
      isCorrect: true,
    },
  };
  const result = formatLogEntry(log, 5);
  assert(result.includes("ANSWER: 选择故障3 (103 和 104 断路) - 正确"));
});

Deno.test("formatLogEntry - answer 错误", () => {
  const log: AnswerLog = {
    timestamp: 1000000000, action: "answer",
    details: {
      trouble: { id: 1, description: "101 和 102 断路", from_wire: 101, to_wire: 102 },
      isCorrect: false,
    },
  };
  const result = formatLogEntry(log, 2);
  assert(result.includes("ANSWER: 选择故障1 (101 和 102 断路) - 错误"));
});

Deno.test("formatLogEntry - finish 类型", () => {
  const log: FinishLog = {
    timestamp: 1000000000, action: "finish",
    details: { score: 85 },
  };
  const result = formatLogEntry(log, 3);
  assert(result.includes("FINISH: 完成测验 - 得分: 85"));
});

Deno.test("formatLogEntry - desk_clean 类型", () => {
  const log: DeskCleanLog = {
    timestamp: 1000000000, action: "desk_clean",
    details: {
      deskCleanResult: {
        image: "", sleeves_num: 0,
        screwdriver_ready: true, wire_stripper_ready: true,
        multimeter_ready: true, crimping_ready: true,
        clean_progress: 0.85,
      },
    },
  };
  const result = formatLogEntry(log, 0);
  assert(result.includes("DESK_CLEAN: 工位清洁 - 桌面干净程度: 85%"));
});

Deno.test("formatLogEntry - desk_clean 0%", () => {
  const log: DeskCleanLog = {
    timestamp: 1000000000, action: "desk_clean",
    details: {
      deskCleanResult: {
        image: "", sleeves_num: 0,
        screwdriver_ready: false, wire_stripper_ready: false,
        multimeter_ready: false, crimping_ready: false,
        clean_progress: 0,
      },
    },
  };
  const result = formatLogEntry(log, 0);
  assert(result.includes("DESK_CLEAN: 工位清洁 - 桌面干净程度: 0%"));
});

Deno.test("formatLogEntry - connect 类型", () => {
  const log: ConnectLog = { timestamp: 1000000000, action: "connect", details: {} };
  const result = formatLogEntry(log, 0);
  assert(result.includes("CONNECT: 连接服务器"));
});

Deno.test("formatLogEntry - disconnect 类型", () => {
  const log: DisconnectLog = { timestamp: 1000000000, action: "disconnect", details: {} };
  const result = formatLogEntry(log, 0);
  assert(result.includes("DISCONNECT: 断开连接"));
});

Deno.test("formatLogEntry - 未知操作", () => {
  const log = { timestamp: 1000000000, action: "unknown_action", details: {} } as never;
  const result = formatLogEntry(log, 0);
  assert(result.includes("UNKNOWN_ACTION: 未知操作"));
});

Deno.test("buildPrompt - 包含低压电气标题", () => {
  const client: Client = { id: "c1", name: "张三", ip: "10.0.0.1", online: true };
  const result = buildPrompt(client);
  assert(result.includes("低压电气装调测试系统 - 综合结果分析"));
  assert(result.includes("学员: 张三 (10.0.0.1)"));
});

Deno.test("buildPrompt - 有testSession时包含排故测验章节", () => {
  const now = Math.floor(Date.now() / 1000);
  const client: Client = {
    id: "c1", name: "李四", ip: "10.0.0.2", online: true,
    testSession: {
      id: "s1",
      test: { id: 1, questions: [{ id: 1, troubles: [{ id: 1, description: "101 和 102 断路", from_wire: 101, to_wire: 102 }] }], startTime: now - 1800, durationTime: 3600 },
      finishTime: now,
      finishedScore: 90,
      logs: [],
    },
  };
  const result = buildPrompt(client);
  assert(result.includes("### 排故测验"));
  assert(result.includes("最终得分: 90"));
  assert(result.includes("题目 1 (ID: 1)"));
});

Deno.test("buildPrompt - 有evaluateBoard时包含功能测试章节", () => {
  const client: Client = {
    id: "c1", name: "王五", ip: "10.0.0.3", online: true,
    evaluateBoard: {
      description: "三相异步电动机正反转控制电路",
      function_steps: [
        { description: "主电路接线", can_wait_for_ms: 300000, waited_for_ms: 240000, passed: true, finished: true },
        { description: "控制电路接线", can_wait_for_ms: 300000, waited_for_ms: 300000, passed: false, finished: true },
      ],
    },
  };
  const result = buildPrompt(client);
  assert(result.includes("### 装接评估-功能测试"));
  assert(result.includes("三相异步电动机正反转控制电路"));
  assert(result.includes("通过率: 50.0%"));
  assert(result.includes("主电路接线"));
  assert(result.includes("控制电路接线"));
  assert(result.includes("超时或未达到预期目标"));
});

Deno.test("buildPrompt - 有cvClient装接评估时包含视觉检测章节", () => {
  const now = Math.floor(Date.now() / 1000);
  const client: Client = {
    id: "c1", name: "赵六", ip: "10.0.0.4", online: true,
    cvClient: {
      clientType: "jetson_nano", ip: "10.0.0.100",
      session: {
        type: "evaluate_wiring",
        startTime: now - 600,
        shots: [{
          timestamp: now - 600, image: "/uploads/wiring.jpg",
          result: { sleeves_num: 55, cross_num: 2, excopper_num: 1, exterminal_num: 0 },
        }],
        finalResult: {
          no_sleeves_num: 5, seleeves_num: 55,
          cross_num: 2, excopper_num: 1, exterminal_num: 0,
          scores: 84,
        },
      },
    },
  };
  const result = buildPrompt(client);
  assert(result.includes("### 装接评估-视觉检测"));
  assert(result.includes("装接工艺检测"));
  assert(result.includes("已标号码管数量: 55"));
  assert(result.includes("交叉接线数量: 2"));
  assert(result.includes("露铜数量: 1"));
  assert(result.includes("未标号码管总数: 5"));
  assert(result.includes("**最终评分**: 84"));
});

Deno.test("buildPrompt - 无cvClient.session时跳过视觉检测章节", () => {
  const client: Client = {
    id: "c1", name: "测试", ip: "10.0.0.5", online: true,
    cvClient: { clientType: "esp32cam", ip: "10.0.0.200" },
  };
  const result = buildPrompt(client);
  assert(!result.includes("装接评估-视觉检测"));
});

Deno.test("buildPrompt - 完整场景包含分析要求", () => {
  const now = Math.floor(Date.now() / 1000);
  const client: Client = {
    id: "c1", name: "完整测试", ip: "10.0.0.6", online: true,
    testSession: {
      id: "s1",
      test: { id: 1, questions: [], startTime: now - 3600, durationTime: null },
      finishedScore: 75,
      logs: [],
    },
    evaluateBoard: {
      description: "测试电路", function_steps: [],
    },
  };
  const result = buildPrompt(client);
  assert(result.includes("## 分析要求"));
  assert(result.includes("整理(Seiri)"));
  assert(result.includes("整顿(Seiton)"));
  assert(result.includes("清扫(Seiso)"));
  assert(result.includes("清洁(Seiketsu)"));
  assert(result.includes("素养(Shitsuke)"));
  assert(result.includes("安全(Safety)"));
  assert(result.includes("节约(Saving)"));
});

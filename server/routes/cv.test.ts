import { assertEquals } from "@std/assert";
import { calcWiringScore, getXiaoxinStatus } from "./cv.ts";

Deno.test("工艺评分算法 - 60个号码管且无问题：满分100", () => {
  assertEquals(calcWiringScore(60, 0, 0), 100);
});

Deno.test("工艺评分算法 - 号码管太少扣分：50个差10个×2=扣20分", () => {
  assertEquals(calcWiringScore(50, 0, 0), 80);
});

Deno.test("工艺评分算法 - 交叉接线扣分：5处×3=扣15分", () => {
  assertEquals(calcWiringScore(60, 5, 0), 85);
});

Deno.test("工艺评分算法 - 露端子扣分：10处×1=扣10分", () => {
  assertEquals(calcWiringScore(60, 0, 10), 90);
});

Deno.test("工艺评分算法 - 综合场景：号码管少+交叉+露端子=最低60分保底", () => {
  assertEquals(calcWiringScore(40, 5, 2), 60);
});

Deno.test("工艺评分算法 - 分数不低于60分（保底机制）", () => {
  assertEquals(calcWiringScore(0, 20, 30), 60);
});

Deno.test("工艺评分算法 - 分数不超过100分（满分上限）", () => {
  assertEquals(calcWiringScore(65, 0, 0), 100);
});

Deno.test("小新AI状态 - 没有视觉客户端：返回默认空闲", () => {
  const s = getXiaoxinStatus(undefined);
  assertEquals(s.type, "status_text_update");
  assertEquals(s.status_text, "");
});

Deno.test("小新AI状态 - 视觉客户端无状态：返回默认空闲", () => {
  const s = getXiaoxinStatus({} as any);
  assertEquals(s.type, "status_text_update");
  assertEquals(s.status_text, "");
});

Deno.test("小新AI状态 - 需要排故状态M1：正确返回", () => {
  const s = getXiaoxinStatus({
    xiaoxin_status: {
      type: "evaluate_need_troubleshoot",
      evaluate_need_troubleshoot_type: "M1_NOT_START",
    },
  } as any);
  assertEquals(s.type, "evaluate_need_troubleshoot");
  assertEquals(s.evaluate_need_troubleshoot_type, "M1_NOT_START");
});

Deno.test("小新AI状态 - 需要排故状态M2：正确返回", () => {
  const s = getXiaoxinStatus({
    xiaoxin_status: {
      type: "evaluate_need_troubleshoot",
      evaluate_need_troubleshoot_type: "M2_NOT_START",
    },
  } as any);
  assertEquals(s.type, "evaluate_need_troubleshoot");
  assertEquals(s.evaluate_need_troubleshoot_type, "M2_NOT_START");
});

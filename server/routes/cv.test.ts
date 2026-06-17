import { assertEquals } from "@std/assert";
import { calcWiringScore, getXiaoxinStatus } from "./cv.ts";

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

Deno.test("评分算法 - 分数范围", () => {
  assertEquals(calcWiringScore(0, 20, 30), 60);
});

Deno.test("评分算法 - 分数不超过100分", () => {
  assertEquals(calcWiringScore(65, 0, 0), 100);
});

Deno.test("小新AI状态 - 无cvClient返回默认空闲", () => {
  const s = getXiaoxinStatus(undefined);
  assertEquals(s.type, "status_text_update");
  assertEquals(s.status_text, "");
});

Deno.test("小新AI状态 - 无xiaoxin_status返回默认", () => {
  const s = getXiaoxinStatus({} as any);
  assertEquals(s.type, "status_text_update");
  assertEquals(s.status_text, "");
});

Deno.test("小新AI状态 - 返回M1_NOT_START", () => {
  const s = getXiaoxinStatus({
    xiaoxin_status: { type: "evaluate_need_troubleshoot", evaluate_need_troubleshoot_type: "M1_NOT_START" },
  } as any);
  assertEquals(s.type, "evaluate_need_troubleshoot");
  assertEquals(s.evaluate_need_troubleshoot_type, "M1_NOT_START");
});

Deno.test("小新AI状态 - 返回M2_NOT_START", () => {
  const s = getXiaoxinStatus({
    xiaoxin_status: { type: "evaluate_need_troubleshoot", evaluate_need_troubleshoot_type: "M2_NOT_START" },
  } as any);
  assertEquals(s.type, "evaluate_need_troubleshoot");
  assertEquals(s.evaluate_need_troubleshoot_type, "M2_NOT_START");
});

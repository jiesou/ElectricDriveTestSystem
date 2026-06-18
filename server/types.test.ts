import { assert, assertEquals } from "@std/assert";
import { getSecondTimestamp } from "./utils/helpers.ts";
import {
  CV_CLIENT_MAP,
  DEFAULT_CV_CLIENT_MAP,
  DEFAULT_TROUBLES,
  TROUBLES,
} from "./types.ts";

Deno.test("工具函数 - 获取当前秒级时间戳：与实际时间误差不超过1秒", () => {
  const ts = getSecondTimestamp();
  const now = Math.floor(Date.now() / 1000);
  assert(Math.abs(ts - now) <= 1);
});

Deno.test("故障列表 - 至少有6个内置故障", () => {
  assert(TROUBLES.length >= 6);
});

Deno.test("故障列表 - 每个故障都有编号、描述和导线端点", () => {
  for (const t of TROUBLES) {
    assertEquals(typeof t.id, "number");
    assertEquals(typeof t.description, "string");
    assertEquals(typeof t.from_wire, "number");
    assertEquals(typeof t.to_wire, "number");
  }
});

Deno.test("客户机映射表 - 数据类型正确（数组）", () => {
  assert(Array.isArray(CV_CLIENT_MAP));
});

Deno.test("客户机映射表 - 每个映射都有源IP、目标IP和类型", () => {
  for (const entry of CV_CLIENT_MAP) {
    assertEquals(typeof entry.clientIp, "string");
    assertEquals(typeof entry.cvClientIp, "string");
    assert(
      entry.cvClientType === "esp32cam" || entry.cvClientType === "jetson_nano",
    );
  }
});

Deno.test("工具函数 - 时间戳是整数", () => {
  const ts = getSecondTimestamp();
  assertEquals(ts, Math.floor(ts));
});

Deno.test("默认故障列表 - 每个故障都有正确的数据结构", () => {
  for (const t of DEFAULT_TROUBLES) {
    assertEquals(typeof t.id, "number");
    assertEquals(typeof t.description, "string");
    assertEquals(typeof t.from_wire, "number");
    assertEquals(typeof t.to_wire, "number");
  }
});

Deno.test("默认客户机映射表 - 默认情况下为空数组", () => {
  assertEquals(DEFAULT_CV_CLIENT_MAP.length, 0);
});

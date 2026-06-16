import { assertEquals, assert, assertInstanceOf } from "@std/assert";
import { getSecondTimestamp, TROUBLES, CV_CLIENT_MAP, DEFAULT_TROUBLES, DEFAULT_CV_CLIENT_MAP } from "./types.ts";

Deno.test("getSecondTimestamp returns current Unix timestamp in seconds", () => {
  const ts = getSecondTimestamp();
  const now = Math.floor(Date.now() / 1000);
  assert(Math.abs(ts - now) <= 1);
});

Deno.test("TROUBLES contains at least 6 default entries", () => {
  assert(TROUBLES.length >= 6);
});

Deno.test("TROUBLES entries have valid Trouble structure", () => {
  for (const t of TROUBLES) {
    assertEquals(typeof t.id, "number");
    assertEquals(typeof t.description, "string");
    assertEquals(typeof t.from_wire, "number");
    assertEquals(typeof t.to_wire, "number");
  }
});

Deno.test("CV_CLIENT_MAP is an array", () => {
  assert(Array.isArray(CV_CLIENT_MAP));
});

Deno.test("CV_CLIENT_MAP entries have valid structure", () => {
  for (const entry of CV_CLIENT_MAP) {
    assertEquals(typeof entry.clientIp, "string");
    assertEquals(typeof entry.cvClientIp, "string");
    assert(entry.cvClientType === "esp32cam" || entry.cvClientType === "jetson_nano");
  }
});

Deno.test("CV_CLIENT_MAP mapping exists for 127.0.0.1", () => {
  const localhostEntry = CV_CLIENT_MAP.find((m) => m.clientIp === "127.0.0.1");
  assert(localhostEntry !== undefined);
  assertEquals(localhostEntry!.cvClientType, "jetson_nano");
});

Deno.test("getSecondTimestamp returns integer", () => {
  const ts = getSecondTimestamp();
  assertEquals(ts, Math.floor(ts));
});

Deno.test("DEFAULT_TROUBLES entries have valid structure", () => {
  for (const t of DEFAULT_TROUBLES) {
    assertEquals(typeof t.id, "number");
    assertEquals(typeof t.description, "string");
    assertEquals(typeof t.from_wire, "number");
    assertEquals(typeof t.to_wire, "number");
  }
});

Deno.test("DEFAULT_CV_CLIENT_MAP is empty", () => {
  assertEquals(DEFAULT_CV_CLIENT_MAP.length, 0);
});

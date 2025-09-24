import { assertEquals } from "@std/assert";
import { generateId, getCurrentTimestamp } from "./main.ts";

Deno.test(function generateIdTest() {
  const id1 = generateId();
  const id2 = generateId();
  
  // IDs should be strings
  assertEquals(typeof id1, "string");
  assertEquals(typeof id2, "string");
  
  // IDs should be different
  assertEquals(id1 === id2, false);
  
  // IDs should have reasonable length
  assertEquals(id1.length > 0, true);
});

Deno.test(function getCurrentTimestampTest() {
  const timestamp = getCurrentTimestamp();
  
  // Should be a number
  assertEquals(typeof timestamp, "number");
  
  // Should be reasonable (within last few years and not in far future)
  const now = Date.now() / 1000;
  assertEquals(Math.abs(timestamp - now) < 1, true); // Within 1 second
});

import { assertEquals, assert } from "@std/assert";
import { imageToDataUrl, imageToBase64 } from "./image.ts";

Deno.test("imageToDataUrl detects JPEG from magic bytes", async () => {
  const bytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
  const result = await imageToDataUrl(bytes);
  assert(result.startsWith("data:image/jpeg;base64,"));
});

Deno.test("imageToDataUrl detects PNG from magic bytes", async () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const result = await imageToDataUrl(bytes);
  assert(result.startsWith("data:image/png;base64,"));
});

Deno.test("imageToDataUrl detects GIF from magic bytes", async () => {
  const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  const result = await imageToDataUrl(bytes);
  assert(result.startsWith("data:image/gif;base64,"));
});

Deno.test("imageToDataUrl detects WebP from magic bytes", async () => {
  const bytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
  ]);
  const result = await imageToDataUrl(bytes);
  assert(result.startsWith("data:image/webp;base64,"));
});

Deno.test("imageToDataUrl defaults to image/jpeg for unknown bytes", async () => {
  const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
  const result = await imageToDataUrl(bytes);
  assert(result.startsWith("data:image/jpeg;base64,"));
});

Deno.test("imageToDataUrl accepts mimeHint override for unknown bytes", async () => {
  const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
  const result = await imageToDataUrl(bytes, "image/gif");
  assert(result.startsWith("data:image/gif;base64,"));
});

Deno.test("imageToDataUrl uses mimeHint even when MIME is detectable", async () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const result = await imageToDataUrl(bytes, "image/webp");
  assert(result.startsWith("data:image/webp;base64,"));
});

Deno.test("imageToDataUrl handles empty array", async () => {
  const bytes = new Uint8Array([]);
  const result = await imageToDataUrl(bytes);
  assertEquals(result, "data:image/jpeg;base64,");
});

Deno.test("imageToBase64 returns pure base64 string", async () => {
  const bytes = new Uint8Array([72, 101, 108, 108, 111]);
  const b64 = await imageToBase64(bytes);
  assertEquals(b64, "SGVsbG8=");
});

Deno.test("imageToBase64 handles empty array", async () => {
  const bytes = new Uint8Array([]);
  const b64 = await imageToBase64(bytes);
  assertEquals(b64, "");
});

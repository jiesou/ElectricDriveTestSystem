import { assertEquals, assert } from "@std/assert";
import { imageToDataUrl, imageToBase64 } from "./image.ts";

Deno.test("图片工具 - 检测 JPEG 图片：返回正确的 data URL 前缀", async () => {
  const bytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
  const result = await imageToDataUrl(bytes);
  assert(result.startsWith("data:image/jpeg;base64,"));
});

Deno.test("图片工具 - 检测 PNG 图片：返回正确的 data URL 前缀", async () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const result = await imageToDataUrl(bytes);
  assert(result.startsWith("data:image/png;base64,"));
});

Deno.test("图片工具 - 检测 GIF 图片：返回正确的 data URL 前缀", async () => {
  const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  const result = await imageToDataUrl(bytes);
  assert(result.startsWith("data:image/gif;base64,"));
});

Deno.test("图片工具 - 检测 WebP 图片：返回正确的 data URL 前缀", async () => {
  const bytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
  ]);
  const result = await imageToDataUrl(bytes);
  assert(result.startsWith("data:image/webp;base64,"));
});

Deno.test("图片工具 - 无法识别的图片格式：默认为 JPEG", async () => {
  const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
  const result = await imageToDataUrl(bytes);
  assert(result.startsWith("data:image/jpeg;base64,"));
});

Deno.test("图片工具 - 手动指定格式：覆盖未知格式的默认值", async () => {
  const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
  const result = await imageToDataUrl(bytes, "image/gif");
  assert(result.startsWith("data:image/gif;base64,"));
});

Deno.test("图片工具 - 手动指定格式：即使能识别也使用手动值", async () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const result = await imageToDataUrl(bytes, "image/webp");
  assert(result.startsWith("data:image/webp;base64,"));
});

Deno.test("图片工具 - 空数组也能正常处理", async () => {
  const bytes = new Uint8Array([]);
  const result = await imageToDataUrl(bytes);
  assertEquals(result, "data:image/jpeg;base64,");
});

Deno.test("图片工具 - base64 转换：返回纯 base64 字符串", async () => {
  const bytes = new Uint8Array([72, 101, 108, 108, 111]);
  const b64 = await imageToBase64(bytes);
  assertEquals(b64, "SGVsbG8=");
});

Deno.test("图片工具 - base64 转换：空数组返回空字符串", async () => {
  const bytes = new Uint8Array([]);
  const b64 = await imageToBase64(bytes);
  assertEquals(b64, "");
});

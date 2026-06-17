import { assertEquals, assert, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { saveUploadedImage, deleteUploadedImage } from "./upload.ts";

Deno.test("saveUploadedImage saves bytes and returns URL path", async () => {
  const bytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
  const url = await saveUploadedImage(bytes, "test-image.jpg");

  assert(url.startsWith("/uploads/"));
  assert(url.endsWith(".jpg"));

  const filePath = join(import.meta.dirname!, "..", "data", "uploads", url.replace("/uploads/", ""));
  const info = await Deno.stat(filePath);
  assert(info.isFile);
  assertEquals(info.size, bytes.length);

  await deleteUploadedImage(url);
  await assertRejects(() => Deno.stat(filePath), Deno.errors.NotFound);
});

Deno.test("saveUploadedImage works without originalName", async () => {
  const bytes = new Uint8Array([0x01, 0x02, 0x03]);
  const url = await saveUploadedImage(bytes);

  assert(url.startsWith("/uploads/"));
  assert(url.endsWith(".jpg"));

  const filePath = join(import.meta.dirname!, "..", "data", "uploads", url.replace("/uploads/", ""));
  const info = await Deno.stat(filePath);
  assert(info.isFile);
  assertEquals(info.size, bytes.length);

  await deleteUploadedImage(url);
  await assertRejects(() => Deno.stat(filePath), Deno.errors.NotFound);
});

Deno.test("deleteUploadedImage ignores non-upload paths", async () => {
  await deleteUploadedImage("/not-uploads/file.jpg");
  await deleteUploadedImage("");
  assert(true);
});

Deno.test("deleteUploadedImage does not throw on missing file", async () => {
  await deleteUploadedImage("/uploads/nonexistent-file-1234.jpg");
  assert(true);
});

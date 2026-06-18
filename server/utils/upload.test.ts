import { assert, assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { deleteUploadedImage, saveUploadedImage } from "./upload.ts";

Deno.test("上传工具 - 保存图片：文件保存成功，返回正确的URL路径", async () => {
  const bytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
  const url = await saveUploadedImage(bytes, "test-image.jpg");

  assert(url.startsWith("/uploads/"));
  assert(url.endsWith(".jpg"));

  const filePath = join(
    import.meta.dirname!,
    "..",
    "data",
    "uploads",
    url.replace("/uploads/", ""),
  );
  const info = await Deno.stat(filePath);
  assert(info.isFile);
  assertEquals(info.size, bytes.length);

  await deleteUploadedImage(url);
  await assertRejects(() => Deno.stat(filePath), Deno.errors.NotFound);
});

Deno.test("上传工具 - 不传文件名也能保存成功", async () => {
  const bytes = new Uint8Array([0x01, 0x02, 0x03]);
  const url = await saveUploadedImage(bytes);

  assert(url.startsWith("/uploads/"));
  assert(url.endsWith(".jpg"));

  const filePath = join(
    import.meta.dirname!,
    "..",
    "data",
    "uploads",
    url.replace("/uploads/", ""),
  );
  const info = await Deno.stat(filePath);
  assert(info.isFile);
  assertEquals(info.size, bytes.length);

  await deleteUploadedImage(url);
  await assertRejects(() => Deno.stat(filePath), Deno.errors.NotFound);
});

Deno.test("上传工具 - 删除文件：路径不在 uploads/ 下则不动", async () => {
  await deleteUploadedImage("/not-uploads/file.jpg");
  await deleteUploadedImage("");
  assert(true);
});

Deno.test("上传工具 - 删除文件：文件不存在不会报错", async () => {
  await deleteUploadedImage("/uploads/nonexistent-file-1234.jpg");
  assert(true);
});

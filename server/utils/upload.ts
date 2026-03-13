/**
 * 图片上传存储工具
 * 将上传的图片保存到 data/uploads/ 目录
 */

import { join } from "@std/path";

// 上传目录路径（相对于 server 目录）
const UPLOAD_DIR = join(Deno.cwd(), "data", "uploads");

/**
 * 确保上传目录存在
 */
export async function ensureUploadDir(): Promise<void> {
  try {
    await Deno.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw error;
    }
  }
}

/**
 * 生成文件名：YYYYMMDDHHMMSS-originalFilename.jpg
 * @param originalName 原始文件名（可选），用于保留有意义的信息
 */
function generateFileName(originalName?: string): string {
  const now = new Date();
  const timestamp = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, "0") +
    now.getDate().toString().padStart(2, "0") +
    now.getHours().toString().padStart(2, "0") +
    now.getMinutes().toString().padStart(2, "0") +
    now.getSeconds().toString().padStart(2, "0");

  // 从原始文件名中提取基本名称（去除扩展名和路径）
  let baseName = "upload";
  if (originalName) {
    // 去除扩展名
    const nameWithoutExt = originalName.replace(/\.[^.]+$/, "");
    // 只保留字母、数字、中文、下划线和连字符，去除其他特殊字符
    baseName = nameWithoutExt.replace(/[^\w\u4e00-\u9fa5-]/g, "").substring(0, 32) || "upload";
  }

  // 添加随机字符串避免冲突
  const randomId = Math.random().toString(36).substring(2, 6);

  return `${timestamp}-${baseName}-${randomId}.jpg`;
}

/**
 * 保存图片到上传目录
 * @param imageBuffer 图片数据
 * @param originalName 原始文件名（可选）
 * @returns 图片的相对 URL 路径（如 /uploads/20260313143052-myfile-abc123.jpg）
 */
export async function saveUploadedImage(imageBuffer: Uint8Array, originalName?: string): Promise<string> {
  await ensureUploadDir();

  const fileName = generateFileName(originalName);
  const filePath = join(UPLOAD_DIR, fileName);

  await Deno.writeFile(filePath, imageBuffer);

  // 返回可通过 HTTP 访问的 URL 路径
  return `/uploads/${fileName}`;
}

/**
 * 删除上传的图片
 * @param urlPath 图片的 URL 路径（如 /uploads/xxx.jpg）
 */
export async function deleteUploadedImage(urlPath: string): Promise<void> {
  if (!urlPath.startsWith("/uploads/")) {
    return;
  }

  const fileName = urlPath.replace("/uploads/", "");
  const filePath = join(UPLOAD_DIR, fileName);

  try {
    await Deno.remove(filePath);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
}

// 服务器启动时确保目录存在
ensureUploadDir().catch(console.error);

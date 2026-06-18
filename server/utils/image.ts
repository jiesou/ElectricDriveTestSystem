// 简单可靠的 image -> base64 工具
// 支持输入: Uint8Array | ArrayBuffer | Blob/File | string(文件路径)
// 返回 data URL: data:<mime>;base64,<base64str>
/**
 * 检测常见图片 MIME 类型（基于文件头）
 */
function detectMime(bytes: Uint8Array): string {
  if (
    bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 &&
    bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  // GIF87a / GIF89a
  if (
    bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 &&
    bytes[2] === 0x46
  ) {
    return "image/gif";
  }
  // WebP 'RIFF'....'WEBP'
  if (
    bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 &&
    bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 &&
    bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "application/octet-stream";
}

export async function imageToDataUrl(
  input: Uint8Array | ArrayBuffer | Blob | File | string,
  mimeHint?: string,
): Promise<string> {
  let bytes: Uint8Array;

  if (typeof input === "string") {
    // 作为文件路径读取
    bytes = await Deno.readFile(input);
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else if (typeof Blob !== "undefined" && input instanceof Blob) {
    const ab = await input.arrayBuffer();
    bytes = new Uint8Array(ab);
  } else {
    // 最后兜底
    const blobLike: Blob = input as unknown as Blob;
    const ab = await blobLike.arrayBuffer();
    bytes = new Uint8Array(ab);
  }

  const detected = detectMime(bytes);
  const mime = mimeHint ||
    (detected === "application/octet-stream" ? "image/jpeg" : detected);

  // 直接对 Uint8Array 做 base64 编码（自实现，避免外部依赖）
  const table =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  const len = bytes.length;
  let i = 0;
  while (i < len) {
    const a = bytes[i++] ?? 0;
    const b = i < len ? bytes[i++] : undefined;
    const c = i < len ? bytes[i++] : undefined;

    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);

    result += table[(triple >> 18) & 0x3f];
    result += table[(triple >> 12) & 0x3f];
    result += typeof b !== "undefined" ? table[(triple >> 6) & 0x3f] : "=";
    result += typeof c !== "undefined" ? table[triple & 0x3f] : "=";
  }

  return `data:${mime};base64,${result}`;
}

export async function imageToBase64(
  input: Uint8Array | ArrayBuffer | Blob | File | string,
): Promise<string> {
  const dataUrl = await imageToDataUrl(input);
  // data:<mime>;base64,<b64>
  const idx = dataUrl.indexOf(",");
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

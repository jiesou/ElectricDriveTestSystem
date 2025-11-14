#!/usr/bin/env -S deno run --allow-net --allow-read

/**
 * CV客户端模拟器 - 用于测试图像上传功能
 * 模拟 CV 客户端定期上传 JPEG 帧到服务器
 */

// 生成一个简单的测试 JPEG 图像（1x1像素的红色图片）
const testJpegBase64 = "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==";

const cvClientIp = "192.168.1.200";
const serverUrl = "http://localhost:8000";

console.log(`[CV Client Simulator] 启动`);
console.log(`[CV Client Simulator] CV客户端IP: ${cvClientIp}`);
console.log(`[CV Client Simulator] 服务器地址: ${serverUrl}`);

// 定期上传帧
setInterval(async () => {
  try {
    const response = await fetch(`${serverUrl}/api/cv/upload_frame`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cvClientIp,
        frame: testJpegBase64,
      }),
    });

    const result = await response.json();
    
    if (result.success) {
      console.log(`[CV Client Simulator] 成功上传帧，大小: ${result.data.frameSize} 字节`);
    } else {
      console.error(`[CV Client Simulator] 上传失败: ${result.error}`);
    }
  } catch (error) {
    console.error(`[CV Client Simulator] 请求错误:`, error.message);
  }
}, 1000); // 每秒上传一帧

console.log(`[CV Client Simulator] 开始每秒上传测试帧...`);

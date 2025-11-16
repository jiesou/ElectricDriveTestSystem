/**
 * 测试 CV 上传端点的 YOLO 推理功能
 */

import sharp from "npm:sharp@0.33.5";

async function testCvEndpoint() {
  console.log("=== 测试 CV 上传端点 ===\n");

  try {
    // 1. 创建测试图像
    console.log("1. 创建测试 JPEG 图像...");
    const testImage = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: 100, g: 150, b: 200 }
      }
    })
    .jpeg()
    .toBuffer();
    
    console.log(`   图像大小: ${testImage.length} 字节\n`);

    // 2. 测试二进制 JPEG 上传（无 JSON）
    console.log("2. 测试二进制 JPEG 上传（应触发服务端推理）...");
    try {
      const response = await fetch("http://localhost:8000/api/cv/upload_wiring", {
        method: "POST",
        headers: {
          "Content-Type": "image/jpeg",
        },
        body: testImage,
      });
      
      console.log(`   状态码: ${response.status}`);
      const result = await response.text();
      console.log(`   响应: ${result}\n`);
    } catch (error) {
      console.log(`   预期错误（无活跃会话）: ${error.message}\n`);
    }

    // 3. 测试 JSON 上传但无 result 字段
    console.log("3. 测试 JSON 上传但无 result 字段（应触发服务端推理）...");
    const base64Image = btoa(String.fromCharCode(...testImage));
    try {
      const response = await fetch("http://localhost:8000/api/cv/upload_wiring", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: `data:image/jpeg;base64,${base64Image}`,
        }),
      });
      
      console.log(`   状态码: ${response.status}`);
      const result = await response.text();
      console.log(`   响应: ${result}\n`);
    } catch (error) {
      console.log(`   预期错误（无活跃会话）: ${error.message}\n`);
    }

    console.log("✅ CV 端点测试完成！");
    console.log("\n注意：实际推理需要先创建活跃的 CV 会话");
    
  } catch (error) {
    console.error("\n❌ 测试失败:", error);
    throw error;
  }
}

// 启动服务器并测试
async function main() {
  console.log("请先确保服务器在运行：deno run -A main.ts\n");
  console.log("等待 3 秒后开始测试...\n");
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  await testCvEndpoint();
}

main();

/**
 * 简单测试脚本，验证 YOLO 推理功能
 */

import { detectObjects } from "./model.ts";
import sharp from "npm:sharp@0.33.5";

async function testModel() {
  console.log("=== YOLO 推理测试 ===");
  
  try {
    // 创建一个简单的测试图像 (640x640 纯色)
    console.log("创建测试图像...");
    const testImage = await sharp({
      create: {
        width: 640,
        height: 640,
        channels: 3,
        background: { r: 128, g: 128, b: 128 }
      }
    })
    .jpeg()
    .toBuffer();
    
    console.log(`测试图像大小: ${testImage.length} 字节`);
    
    // 运行推理
    console.log("运行 YOLO 推理...");
    const result = await detectObjects(testImage, 0.1, 0.3);
    
    console.log("\n=== 推理结果 ===");
    console.log(`号码管数量: ${result.sleeves_num}`);
    console.log(`交叉数量: ${result.cross_num}`);
    console.log(`露铜数量: ${result.excopper_num}`);
    console.log(`露端子数量: ${result.exterminal_num}`);
    
    console.log("\n✅ 测试成功！");
  } catch (error) {
    console.error("\n❌ 测试失败:", error);
    throw error;
  }
}

testModel();

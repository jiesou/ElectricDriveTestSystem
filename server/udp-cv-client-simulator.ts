#!/usr/bin/env -S deno run --allow-net --allow-read --unstable-net

/**
 * UDP CV客户端模拟器 - 用于测试 UDP 图像传输功能
 * 模拟 CV 客户端通过 UDP 发送分片的 JPEG 帧到服务器
 */

// 生成一个简单的测试 JPEG 图像（1x1像素的红色图片）
const testJpegBase64 = "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==";

// 解码 base64 为字节数组
function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

const jpegData = base64ToBytes(testJpegBase64);

// CV 客户端配置
const cvClientIp = "192.168.1.200";
const serverHost = "127.0.0.1";
const serverPort = 8000;
const chunkSize = 1024; // 每个分片的大小

console.log(`[UDP CV Simulator] 启动`);
console.log(`[UDP CV Simulator] CV客户端IP: ${cvClientIp}`);
console.log(`[UDP CV Simulator] 服务器地址: ${serverHost}:${serverPort}`);
console.log(`[UDP CV Simulator] 图像大小: ${jpegData.length} 字节`);

// 创建 UDP 连接
const socket = Deno.listenDatagram({
  port: 0, // 使用随机端口
  transport: "udp",
});

const serverAddr: Deno.NetAddr = {
  transport: "udp",
  hostname: serverHost,
  port: serverPort,
};

/**
 * 发送一帧图像
 * @param frameIndex 帧索引
 */
async function sendFrame(frameIndex: number) {
  // 计算需要的分片数量
  const chunkTotal = Math.ceil(jpegData.length / chunkSize);
  
  for (let chunkIndex = 0; chunkIndex < chunkTotal; chunkIndex++) {
    // 计算当前分片的数据
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, jpegData.length);
    const chunkPayload = jpegData.slice(start, end);
    
    // 构建 UDP 数据包
    // 格式：4字节IP + 4字节frame_index + 2字节chunk_index + 2字节chunk_total + payload
    const packet = new Uint8Array(12 + chunkPayload.length);
    
    // 写入 CV 客户端 IP（192.168.1.200）
    const ipParts = cvClientIp.split('.').map(Number);
    packet[0] = ipParts[0];
    packet[1] = ipParts[1];
    packet[2] = ipParts[2];
    packet[3] = ipParts[3];
    
    // 写入 frame_index（小端序 uint32）
    const frameIndexView = new DataView(packet.buffer, 4, 4);
    frameIndexView.setUint32(0, frameIndex, true);
    
    // 写入 chunk_index（小端序 uint16）
    const chunkIndexView = new DataView(packet.buffer, 8, 2);
    chunkIndexView.setUint16(0, chunkIndex, true);
    
    // 写入 chunk_total（小端序 uint16）
    const chunkTotalView = new DataView(packet.buffer, 10, 2);
    chunkTotalView.setUint16(0, chunkTotal, true);
    
    // 写入 payload
    packet.set(chunkPayload, 12);
    
    // 发送 UDP 数据包
    await socket.send(packet, serverAddr);
    
    // console.log(`[UDP CV Simulator] 发送分片: frame=${frameIndex}, chunk=${chunkIndex}/${chunkTotal}`);
  }
  
  console.log(`[UDP CV Simulator] 发送完整帧 #${frameIndex}，共 ${chunkTotal} 个分片`);
}

// 定期发送帧
let frameIndex = 0;
const intervalId = setInterval(async () => {
  try {
    await sendFrame(frameIndex);
    frameIndex++;
  } catch (error) {
    console.error(`[UDP CV Simulator] 发送错误:`, error);
  }
}, 1000); // 每秒发送一帧

console.log(`[UDP CV Simulator] 开始每秒发送测试帧...`);
console.log(`[UDP CV Simulator] 按 Ctrl+C 停止`);

// 清理
Deno.addSignalListener("SIGINT", () => {
  console.log("\n[UDP CV Simulator] 停止");
  clearInterval(intervalId);
  socket.close();
  Deno.exit(0);
});

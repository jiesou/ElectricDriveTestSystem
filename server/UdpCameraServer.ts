import { createSocket } from "node:dgram";
import { clientManager } from "./ClientManager.ts";

/**
 * UDP 摄像头图传接收器
 * 接收来自 ESP32-CAM 或 Jetson Nano 的 UDP 分片 JPEG 数据包并组装完整帧
 */
export class UdpCameraServer {
  private frameBuffer: Map<number, Map<number, Uint8Array>> = new Map(); // frame_id -> {chunk_id: bytes}
  private frameChunkCount: Map<number, number> = new Map(); // frame_id -> chunk_total
  private socket?: ReturnType<typeof createSocket>;

  /**
   * 启动 UDP 监听器
   * @param port UDP 端口号，默认 8000
   */
  start(port = 8000): void {
    try {
      this.socket = createSocket("udp4");

      this.socket.on("error", (err) => {
        console.error("[UdpCamera] UDP socket error:", err);
      });

      this.socket.on("message", (msg, _rinfo) => {
        // console.log(`[UdpCamera] 收到 UDP 包，大小: ${msg.length} 字节，来自 ${_rinfo.address}:${_rinfo.port}`);
        this.processPacket(msg);
      });

      this.socket.on("listening", () => {
        const address = this.socket!.address();
        console.log(`[UdpCamera] UDP 图传接收器工作在 ${address.address}:${address.port}`);
      });

      this.socket.bind(port);
    } catch (error) {
      console.error("[UdpCamera] 启动 UDP 监听器失败:", error);
      // 不抛出错误，让服务器继续运行
    }
  }

  /**
   * 处理单个 UDP 数据包
   * @param data 数据包内容
   */
  private processPacket(data: Uint8Array): void {
    if (data.length < 8) {
      // 包头不足：4字节 frame_index + 2字节 chunk_index + 2字节 chunk_total
      return;
    }

    // 解析包头（小端序）
    const frameIndex = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
    const chunkIndex = data[4] | (data[5] << 8);
    const chunkTotal = data[6] | (data[7] << 8);
    const chunkPayload = data.slice(8);
    
    // console.log(`[UdpCamera] 帧 ${frameIndex}, 分片 ${chunkIndex}/${chunkTotal}, 大小: ${chunkPayload.length}`);

    // 存入缓存
    if (!this.frameBuffer.has(frameIndex)) {
      this.frameBuffer.set(frameIndex, new Map());
    }
    this.frameBuffer.get(frameIndex)!.set(chunkIndex, chunkPayload);
    this.frameChunkCount.set(frameIndex, chunkTotal);
    // console.log(`[UdpCamera] 接收帧 ${frameIndex} 的分片 ${chunkIndex + 1}/${chunkTotal}，大小: ${chunkPayload.length} 字节`);

    // 清理旧的缓存
    this.cleanupBuffer();

    // 检查是否收齐了所有分片
    const chunks = this.frameBuffer.get(frameIndex)!;
    if (chunks.size === chunkTotal) {
      // 组装完整帧
      try {
        const orderedChunks: Uint8Array[] = [];
        for (let i = 0; i < chunkTotal; i++) {
          const chunk = chunks.get(i);
          if (!chunk) {
            // 有分片丢失，跳过
            this.frameBuffer.delete(frameIndex);
            this.frameChunkCount.delete(frameIndex);
            return;
          }
          orderedChunks.push(chunk);
        }

        // 计算总长度
        const totalLength = orderedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const latestFrame = new Uint8Array(totalLength);

        // 复制所有分片到一个连续的数组
        let offset = 0;
        for (const chunk of orderedChunks) {
          latestFrame.set(chunk, offset);
          offset += chunk.length;
        }

        // 更新所有 cvClient 的 latest_frame
        // 注意：这里假设所有 cvClient 都接收同一个图像流
        // 如果需要区分不同的 cvClient，需要在包头中包含 cvClientIp 或其他标识
        this.updateFrame(latestFrame);

        // 清理已处理的帧缓存
        this.frameBuffer.delete(frameIndex);
        this.frameChunkCount.delete(frameIndex);
      } catch (error) {
        console.error("[UdpCamera] 组装帧失败:", error);
        this.frameBuffer.delete(frameIndex);
        this.frameChunkCount.delete(frameIndex);
      }
    }
  }

  /**
   * 更新所有 cvClient 的 latest_frame
   * @param frame JPEG 帧数据
   */
  private updateFrame(frame: Uint8Array): void {
    let updatedCount = 0;
    for (const client of Object.values(clientManager.clients)) {
      if (client.cvClient) {
        client.cvClient.latest_frame = frame;
        updatedCount++;
      }
    }
    
    if (updatedCount === 0) {
      console.warn(`[UdpCamera] 警告：没有找到存在的 CV 客户端！`);
    }
  }

  /**
   * 清理过时的帧缓存
   * 只删除超时或不可能完成的帧（比最新帧旧超过5帧的）
   */
  private cleanupBuffer(): void {
    if (this.frameBuffer.size === 0) return;

    const maxFrameId = Math.max(...Array.from(this.frameBuffer.keys()));
    const framesToRemove: number[] = [];

    for (const frameId of this.frameBuffer.keys()) {
      if (maxFrameId - frameId > 5) {
        framesToRemove.push(frameId);
      }
    }

    for (const frameId of framesToRemove) {
      this.frameBuffer.delete(frameId);
      this.frameChunkCount.delete(frameId);
    }
  }

  /**
   * 停止 UDP 接收器
   */
  stop(): void {
    if (this.socket) {
      try {
        this.socket.close();
        console.log("[UdpCamera] UDP 图传接收器已停止");
      } catch (error) {
        console.error("[UdpCamera] 停止 UDP 监听器失败:", error);
      }
    }
  }
}

// 全局单例
export const udpCameraServer = new UdpCameraServer();

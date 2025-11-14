import { clientManager } from "./ClientManager.ts";

/**
 * UDP 摄像头图传接收器
 * 接收来自 ESP32-CAM 或 Jetson Nano 的 UDP 分片 JPEG 数据包并组装完整帧
 */
export class UdpCameraReceiver {
  private frameBuffer: Map<number, Map<number, Uint8Array>> = new Map(); // frame_id -> {chunk_id: bytes}
  private frameChunkCount: Map<number, number> = new Map(); // frame_id -> chunk_total
  private listener?: Deno.DatagramConn;

  /**
   * 启动 UDP 监听器
   * @param port UDP 端口号，默认 8000
   */
  async start(port = 8000): Promise<void> {
    try {
      // 注意：Deno 2.x 中需要使用 --unstable-net 标志来启用 UDP 支持
      this.listener = Deno.listenDatagram({
        port,
        transport: "udp",
      });

      console.log(`[UdpCamera] UDP 图传接收器启动，监听端口 ${port}`);

      // 异步处理 UDP 数据包
      this.receiveLoop();
    } catch (error) {
      console.error("[UdpCamera] 启动 UDP 监听器失败:", error);
      console.error("[UdpCamera] 提示：需要使用 --unstable-net 标志启动服务器");
      // 不抛出错误，让服务器继续运行
    }
  }

  /**
   * 接收循环
   */
  private async receiveLoop(): Promise<void> {
    if (!this.listener) return;

    try {
      for await (const [data, _addr] of this.listener) {
        this.processPacket(data);
      }
    } catch (error) {
      console.error("[UdpCamera] UDP 接收循环错误:", error);
    }
  }

  /**
   * 处理单个 UDP 数据包
   * @param data 数据包内容
   */
  private processPacket(data: Uint8Array): void {
    if (data.length < 12) {
      // 包头不足：4字节IP + 4字节frame_index + 2字节chunk_index + 2字节chunk_total
      return;
    }

    // 解析包头
    const cvClientIp = `${data[0]}.${data[1]}.${data[2]}.${data[3]}`;
    const frameIndex = new DataView(data.buffer, data.byteOffset + 4, 4).getUint32(0, true);
    const chunkIndex = new DataView(data.buffer, data.byteOffset + 8, 2).getUint16(0, true);
    const chunkTotal = new DataView(data.buffer, data.byteOffset + 10, 2).getUint16(0, true);
    const chunkPayload = data.slice(12);

    // 存入缓存
    if (!this.frameBuffer.has(frameIndex)) {
      this.frameBuffer.set(frameIndex, new Map());
    }
    this.frameBuffer.get(frameIndex)!.set(chunkIndex, chunkPayload);
    this.frameChunkCount.set(frameIndex, chunkTotal);

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

        // 更新对应的 cvClient
        this.updateCvClientFrame(cvClientIp, latestFrame);

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
   * 更新 cvClient 的 latest_frame
   * @param cvClientIp CV客户端IP
   * @param frame JPEG 帧数据
   */
  private updateCvClientFrame(cvClientIp: string, frame: Uint8Array): void {
    // 查找关联此 CV 客户端的普通客户端
    const client = Object.values(clientManager.clients).find(
      (c) => c.cvClient?.ip === cvClientIp
    );

    if (client && client.cvClient) {
      client.cvClient.latest_frame = frame;
      // console.log(`[UdpCamera] 更新 CV 客户端 ${cvClientIp} 的帧，大小: ${frame.length} 字节`);
    } else {
      // console.warn(`[UdpCamera] 未找到 IP 为 ${cvClientIp} 的 CV 客户端`);
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
    if (this.listener) {
      try {
        this.listener.close();
        console.log("[UdpCamera] UDP 图传接收器已停止");
      } catch (error) {
        console.error("[UdpCamera] 停止 UDP 监听器失败:", error);
      }
    }
  }
}

// 全局单例
export const udpCameraReceiver = new UdpCameraReceiver();

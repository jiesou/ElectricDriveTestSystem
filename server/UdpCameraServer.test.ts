import { assertEquals, assert, assertExists } from "@std/assert";

import { UdpCameraServer } from "./UdpCameraServer.ts";

Deno.test("Udp摄像头服务器 - 可以创建实例", () => {
  const server = new UdpCameraServer();
  assertExists(server);
});

Deno.test("Udp摄像头服务器 - 单包帧解析：正确读取包头并组装完整帧", () => {
  const server = new UdpCameraServer();

  const header = new Uint8Array([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00]);
  const jpegData = new Uint8Array([0xFF, 0xD8, 0x00, 0x01, 0x00, 0x02, 0xFF, 0xD9]);
  const packet = new Uint8Array(header.length + jpegData.length);
  packet.set(header);
  packet.set(jpegData, header.length);

  (server as any).processPacket(packet);

  assert(!(server as any).frameBuffer.has(1));
});

Deno.test("Udp摄像头服务器 - 短包（不足8字节）直接忽略", () => {
  const server = new UdpCameraServer();
  const shortPacket = new Uint8Array([0x01, 0x02, 0x03]);

  (server as any).processPacket(shortPacket);

  assertEquals((server as any).frameBuffer.size, 0);
});

Deno.test("Udp摄像头服务器 - 多包分片帧：按顺序组装完整", () => {
  const server = new UdpCameraServer();

  const buildChunk = (frameIdx: number, chunkIdx: number, total: number, payload: Uint8Array) => {
    const header = new Uint8Array(8);
    const dv = new DataView(header.buffer);
    dv.setUint32(0, frameIdx, true);
    dv.setUint16(4, chunkIdx, true);
    dv.setUint16(6, total, true);

    const packet = new Uint8Array(8 + payload.length);
    packet.set(header);
    packet.set(payload, 8);
    return packet;
  };

  const chunk0 = buildChunk(2, 0, 3, new Uint8Array([0xFF, 0xD8, 0x00]));
  const chunk1 = buildChunk(2, 1, 3, new Uint8Array([0x01, 0x02]));
  const chunk2 = buildChunk(2, 2, 3, new Uint8Array([0x03, 0xFF, 0xD9]));

  (server as any).processPacket(chunk0);
  assert((server as any).frameBuffer.has(2));
  assertEquals((server as any).frameBuffer.get(2)!.size, 1);

  (server as any).processPacket(chunk1);
  assertEquals((server as any).frameBuffer.get(2)!.size, 2);

  (server as any).processPacket(chunk2);
  assert(!(server as any).frameBuffer.has(2));
});

Deno.test("Udp摄像头服务器 - 清理太旧的帧缓存（超过5帧差距）", () => {
  const server = new UdpCameraServer();
  const buf = server as any;

  buf.frameBuffer.set(1, new Map());
  buf.frameBuffer.set(2, new Map());
  buf.frameBuffer.set(10, new Map());
  buf.frameChunkCount.set(1, 1);
  buf.frameChunkCount.set(2, 1);
  buf.frameChunkCount.set(10, 1);

  buf.cleanupBuffer();

  assert(!buf.frameBuffer.has(1));
  assert(!buf.frameBuffer.has(2));
  assert(buf.frameBuffer.has(10));
});

Deno.test("Udp摄像头服务器 - 空缓存清理不报错", () => {
  const server = new UdpCameraServer();
  const buf = server as any;

  buf.cleanupBuffer();
  assertEquals(buf.frameBuffer.size, 0);
});

Deno.test("Udp摄像头服务器 - 未启动时停止服务器不报错", () => {
  const server = new UdpCameraServer();
  server.stop();
});

Deno.test("Udp摄像头服务器 - 绑定端口0会失败但不会崩溃", () => {
  const server = new UdpCameraServer();
  server.start(0);
  server.stop();
});

Deno.test("Udp摄像头服务器 - 收到完整帧后更新所有关联客户机的最新帧", async () => {
  const server = new UdpCameraServer();
  const { clientManager } = await import("./ClientManager.ts");

  const frame1 = new Uint8Array([0xFF, 0xD8, 0xFF]);
  const frame2 = new Uint8Array([0xFF, 0xD8, 0xFE]);

  const client1 = clientManager.connectClient("10.99.0.1", makeFakeSocket());
  client1.cvClient = { clientType: "jetson_nano", ip: "10.99.1.1" };

  const client2 = clientManager.connectClient("10.99.0.2", makeFakeSocket());
  client2.cvClient = { clientType: "esp32cam", ip: "10.99.1.2" };

  (server as any).updateFrame(frame1);

  assertEquals(client1.cvClient!.latest_frame, frame1);
  assertEquals(client2.cvClient!.latest_frame, frame1);

  (server as any).updateFrame(frame2);
  assertEquals(client1.cvClient!.latest_frame, frame2);

  delete clientManager.clients[client1.id];
  delete clientManager.clients[client2.id];
});

function makeFakeSocket(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: (_data: string | ArrayBufferLike | Blob) => {},
    close: (_code?: number, _reason?: string) => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as unknown as WebSocket;
}

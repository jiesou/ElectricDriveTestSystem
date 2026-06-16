import { assertEquals, assert, assertExists } from "@std/assert";

// We import the class to test the packet parsing logic
// The singleton udpCameraServer would bind to a real port, so we instantiate separately.
import { UdpCameraServer } from "./UdpCameraServer.ts";

Deno.test("UdpCameraServer can be instantiated", () => {
  const server = new UdpCameraServer();
  assertExists(server);
});

Deno.test("processPacket parses header correctly for single-chunk frame", () => {
  const server = new UdpCameraServer();

  // Build a packet:
  // Header: frameIndex=1 (4 bytes LE), chunkIndex=0 (2 bytes), chunkTotal=1 (2 bytes)
  // Payload: [0xFF, 0xD8, ...JPEG data..., 0xFF, 0xD9]
  const header = new Uint8Array([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00]);
  const jpegData = new Uint8Array([0xFF, 0xD8, 0x00, 0x01, 0x00, 0x02, 0xFF, 0xD9]);
  const packet = new Uint8Array(header.length + jpegData.length);
  packet.set(header);
  packet.set(jpegData, header.length);

  // Access private method via type assertion
  (server as any).processPacket(packet);

  // The frame buffer should now contain the assembled frame
  const cvClientIps = Object.keys((server as any).frameBuffer || {});
  // Frame should have been processed and removed since single chunk assembles immediately
  assert(!(server as any).frameBuffer.has(1));
});

Deno.test("processPacket ignores packets shorter than 8 bytes", () => {
  const server = new UdpCameraServer();
  const shortPacket = new Uint8Array([0x01, 0x02, 0x03]);

  (server as any).processPacket(shortPacket);

  // No frames should be in the buffer
  assertEquals((server as any).frameBuffer.size, 0);
});

Deno.test("processPacket assembles multi-chunk frame correctly", () => {
  const server = new UdpCameraServer();

  // Frame 2, 3 chunks
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
  // Not yet complete
  assert((server as any).frameBuffer.has(2));
  assertEquals((server as any).frameBuffer.get(2)!.size, 1);

  (server as any).processPacket(chunk1);
  assertEquals((server as any).frameBuffer.get(2)!.size, 2);

  (server as any).processPacket(chunk2);
  // Should be assembled and removed after all chunks received
  assert(!(server as any).frameBuffer.has(2));
});

Deno.test("cleanupBuffer removes old frames beyond threshold", () => {
  const server = new UdpCameraServer();
  const buf = server as any;

  // Manually add frames
  buf.frameBuffer.set(1, new Map());
  buf.frameBuffer.set(2, new Map());
  buf.frameBuffer.set(10, new Map());
  buf.frameChunkCount.set(1, 1);
  buf.frameChunkCount.set(2, 1);
  buf.frameChunkCount.set(10, 1);

  buf.cleanupBuffer();

  // Frames 1 and 2 are more than 5 frames behind max (10), should be removed
  assert(!buf.frameBuffer.has(1));
  assert(!buf.frameBuffer.has(2));
  // Frame 10 should remain
  assert(buf.frameBuffer.has(10));
});

Deno.test("cleanupBuffer handles empty buffer", () => {
  const server = new UdpCameraServer();
  const buf = server as any;

  // Should not throw
  buf.cleanupBuffer();
  assertEquals(buf.frameBuffer.size, 0);
});

Deno.test("stop does nothing when not started", () => {
  const server = new UdpCameraServer();
  // Should not throw
  server.stop();
});

Deno.test("start with port 0 should not throw (will fail to bind but caught)", () => {
  const server = new UdpCameraServer();
  server.start(0);
  server.stop();
});

Deno.test("updateFrame sets latest_frame on all cvClients", async () => {
  const server = new UdpCameraServer();
  const { clientManager } = await import("./ClientManager.ts");

  // Create clients with cvClients
  const frame1 = new Uint8Array([0xFF, 0xD8, 0xFF]);
  const frame2 = new Uint8Array([0xFF, 0xD8, 0xFE]);

  const client1 = clientManager.connectClient("10.99.0.1", makeFakeSocket());
  client1.cvClient = { clientType: "jetson_nano", ip: "10.99.1.1" };

  const client2 = clientManager.connectClient("10.99.0.2", makeFakeSocket());
  client2.cvClient = { clientType: "esp32cam", ip: "10.99.1.2" };

  // Call private updateFrame
  (server as any).updateFrame(frame1);

  assertEquals(client1.cvClient!.latest_frame, frame1);
  assertEquals(client2.cvClient!.latest_frame, frame1);

  // Update again
  (server as any).updateFrame(frame2);
  assertEquals(client1.cvClient!.latest_frame, frame2);
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

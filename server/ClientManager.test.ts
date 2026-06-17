import { assertEquals, assert, assertExists } from "@std/assert";
import { ClientManager } from "./ClientManager.ts";
import { getSecondTimestamp } from "./types.ts";
import { prisma } from "./prisma/client.ts";

function makeFakeSocket(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: (_data: string | ArrayBufferLike | Blob) => {},
    close: (_code?: number, _reason?: string) => {},
    onmessage: null,
    onclose: null,
    onerror: null,
    onopen: null,
    url: "",
    protocol: "",
    extensions: "",
    bufferedAmount: 0,
    binaryType: "blob" as BinaryType,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as unknown as WebSocket;
}

Deno.test("connectClient creates a new client with valid fields", () => {
  const mgr = new ClientManager();
  const socket = makeFakeSocket();
  const client = mgr.connectClient("192.168.1.1", socket);

  assertExists(client.id);
  assertEquals(client.ip, "192.168.1.1");
  assertEquals(client.name, "192.168.1.1");
  assertEquals(client.online, true);
  assertEquals(client.socket, socket);
  assertExists(client.lastPing);
});

Deno.test("connectClient reuses existing client on same IP reconnect", () => {
  const mgr = new ClientManager();
  const socket1 = makeFakeSocket();
  const client1 = mgr.connectClient("192.168.1.2", socket1);

  const socket2 = makeFakeSocket();
  const client2 = mgr.connectClient("192.168.1.2", socket2);

  assertEquals(client1.id, client2.id, "same IP should reuse same client id");
  assertEquals(client2.online, true);
  assertEquals(client2.socket, socket2);
});

Deno.test("connectClient creates separate clients for different IPs", () => {
  const mgr = new ClientManager();
  const c1 = mgr.connectClient("10.0.0.1", makeFakeSocket());
  const c2 = mgr.connectClient("10.0.0.2", makeFakeSocket());

  assert(c1.id !== c2.id, "different IPs should have different ids");
  assertEquals(Object.keys(mgr.clients).length, 2);
});

Deno.test("disconnectClient sets offline and clears socket and lastPing", () => {
  const mgr = new ClientManager();
  const client = mgr.connectClient("10.0.0.3", makeFakeSocket());

  mgr.disconnectClient(client);

  assertEquals(client.online, false);
  assertEquals(client.socket, undefined);
  assertEquals(client.lastPing, undefined);
});

Deno.test("ping message updates lastPing and sends pong", () => {
  const mgr = new ClientManager();
  let sentData = "";
  const socket = {
    readyState: WebSocket.OPEN,
    send: (data: string) => { sentData = data; },
    close: () => {},
  } as unknown as WebSocket;
  const client = mgr.connectClient("10.0.0.4", socket);
  const oldPing = client.lastPing;

  mgr.processWebSocketMessageIn(client, socket, { type: "ping" });

  assert(client.lastPing! >= (oldPing || 0));
  assertEquals(client.online, true);
  const pong = JSON.parse(sentData);
  assertEquals(pong.type, "pong");
});

Deno.test("client_name_update_request updates name and sends push", () => {
  const mgr = new ClientManager();
  let sentData = "";
  const socket = {
    readyState: WebSocket.OPEN,
    send: (data: string) => { sentData = data; },
    close: () => {},
  } as unknown as WebSocket;
  const client = mgr.connectClient("10.0.0.5", socket);

  mgr.processWebSocketMessageIn(client, socket, {
    type: "client_name_update_request",
    name: "测试台位1",
  });

  assertEquals(client.name, "测试台位1");
  const push = JSON.parse(sentData);
  assertEquals(push.type, "client_name_push");
  assertEquals(push.name, "测试台位1");
});

Deno.test("client_name_update_request rejects empty name", () => {
  const mgr = new ClientManager();
  const socket = makeFakeSocket();
  const client = mgr.connectClient("10.0.0.6", socket);
  const oldName = client.name;

  mgr.processWebSocketMessageIn(client, socket, {
    type: "client_name_update_request",
    name: "   ",
  });

  assertEquals(client.name, oldName);
});

Deno.test("sendWSMessage sends JSON to socket when socket exists", () => {
  const mgr = new ClientManager();
  let sentData = "";
  const socket = {
    send: (data: string) => { sentData = data; },
  } as unknown as WebSocket;

  mgr.sendWSMessage(socket, { type: "test", data: "hello" });

  const parsed = JSON.parse(sentData);
  assertEquals(parsed.type, "test");
  assertEquals(parsed.data, "hello");
});

Deno.test("sendWSMessage handles undefined socket gracefully", () => {
  const mgr = new ClientManager();
  // Should not throw
  mgr.sendWSMessage(undefined, { type: "test" });
});

Deno.test("addWSMessageHandler and dispatch work correctly", () => {
  const mgr = new ClientManager();
  let handledType = "";
  mgr.addWSMessageHandler((_client, _socket, message) => {
    handledType = message.type;
  });

  const socket = makeFakeSocket();
  const client = mgr.connectClient("10.0.0.7", socket);

  // ping messages are handled before dispatching to handlers
  mgr.processWebSocketMessageIn(client, socket, { type: "custom_event" });
  assertEquals(handledType, "custom_event");
});

Deno.test("findClientsByCvIp returns matching clients", () => {
  const mgr = new ClientManager();
  const client = mgr.connectClient("10.0.0.8", makeFakeSocket());
  client.cvClient = { clientType: "jetson_nano", ip: "192.168.1.100" };

  const result = mgr.findClientsByCvIp("192.168.1.100");
  assertEquals(result.length, 1);
  assertEquals(result[0].id, client.id);
});

Deno.test("findClientsByCvIp auto-binds when no match exists", () => {
  const mgr = new ClientManager();
  mgr.connectClient("10.0.0.9", makeFakeSocket());

  const result = mgr.findClientsByCvIp("192.168.1.200");
  assert(result.length > 0);
  assertEquals(result[0].cvClient!.ip, "192.168.1.200");
  // cvClients should also be created
  assertExists(mgr.cvClients["192.168.1.200"]);
});

Deno.test("findClientByCvIp returns first client or null", () => {
  const mgr = new ClientManager();
  const client = mgr.connectClient("10.0.0.10", makeFakeSocket());
  client.cvClient = { clientType: "esp32cam", ip: "192.168.1.50" };

  const found = mgr.findClientByCvIp("192.168.1.50");
  assertExists(found);
  assertEquals(found!.id, client.id);

  const notFound = mgr.findClientByCvIp("192.168.1.999");
  assertEquals(notFound, null);
});

Deno.test("connectClient with CV_CLIENT_MAP matching IP binds cvClient", () => {
  const mgr = new ClientManager();
  // 127.0.0.1 matches cvClientMap.json -> 192.168.11.121
  const client = mgr.connectClient("127.0.0.1", makeFakeSocket());

  assertExists(client.cvClient);
  assertEquals(client.cvClient!.ip, "192.168.11.121");
  assertEquals(client.cvClient!.clientType, "jetson_nano");
  assertExists(mgr.cvClients["192.168.11.121"]);
});

Deno.test("connectClient fallback to first cvClient when no exact match", () => {
  const mgr = new ClientManager();
  // First connect with a CV-mapped IP to seed cvClients
  mgr.connectClient("127.0.0.1", makeFakeSocket());

  // Then connect with a non-mapped IP - should auto-bind to first cvClient
  const client = mgr.connectClient("10.0.0.99", makeFakeSocket());
  assertExists(client.cvClient, "非映射IP应通过fallback绑定第一个cvClient");
  assertEquals(client.cvClient!.ip, "192.168.11.121");
});

Deno.test("sendWSMessage catch error gracefully", () => {
  const mgr = new ClientManager();
  const badSocket = {
    send: () => { throw new Error("send failed"); },
  } as unknown as WebSocket;

  // Should not throw
  mgr.sendWSMessage(badSocket, { type: "test" });
});

Deno.test("processWebSocketMessageIn with no handlers handles unknown type without error", () => {
  const mgr = new ClientManager();
  const socket = makeFakeSocket();
  const client = mgr.connectClient("10.0.0.11", socket);

  // 未注册 handler 的 ClientManager 遇到未知消息类型应不抛错、不产生影响
  mgr.processWebSocketMessageIn(client, socket, { type: "unknown_type" });
  assertEquals(client.socket, socket); // socket 引用被更新
});

Deno.test("heartbeat timeout disconnects stale client", async () => {
  const mgr = new ClientManager();
  const client = mgr.connectClient("10.0.0.99", makeFakeSocket());

  // 手动设置 lastPing 为 20 秒前（HEARTBEAT_TIMEOUT = 10s）
  client.lastPing = getSecondTimestamp() - 20;

  // 启动心跳检查（间隔 2s）
  mgr.startHeartbeat();

  // 等待至少一个检查周期
  await new Promise(r => setTimeout(r, 2100));

  assertEquals(client.online, false);
  assertEquals(client.socket, undefined);

  mgr.stopHeartbeat();
});

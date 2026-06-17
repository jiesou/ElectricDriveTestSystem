import { assertEquals, assert, assertExists } from "@std/assert";
import { ClientManager } from "./ClientManager.ts";
import { getSecondTimestamp } from "./types.ts";

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

Deno.test("客户机管理 - 新建连接：创建合法客户机，IP、在线状态正确", () => {
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

Deno.test("客户机管理 - 同一IP重连：复用之前的客户机编号", () => {
  const mgr = new ClientManager();
  const socket1 = makeFakeSocket();
  const client1 = mgr.connectClient("192.168.1.2", socket1);

  const socket2 = makeFakeSocket();
  const client2 = mgr.connectClient("192.168.1.2", socket2);

  assertEquals(client1.id, client2.id, "same IP should reuse same client id");
  assertEquals(client2.online, true);
  assertEquals(client2.socket, socket2);
});

Deno.test("客户机管理 - 不同IP连接：分配不同的客户机编号", () => {
  const mgr = new ClientManager();
  const c1 = mgr.connectClient("10.0.0.1", makeFakeSocket());
  const c2 = mgr.connectClient("10.0.0.2", makeFakeSocket());

  assert(c1.id !== c2.id, "different IPs should have different ids");
  assertEquals(Object.keys(mgr.clients).length, 2);
});

Deno.test("客户机管理 - 断开连接：标记离线，清除 socket 和心跳时间", () => {
  const mgr = new ClientManager();
  const client = mgr.connectClient("10.0.0.3", makeFakeSocket());

  mgr.disconnectClient(client);

  assertEquals(client.online, false);
  assertEquals(client.socket, undefined);
  assertEquals(client.lastPing, undefined);
});

Deno.test("客户机管理 - 收到 ping：更新时间戳，回复 pong", () => {
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

Deno.test("客户机管理 - 更新名称：保存新名字，回复确认消息", () => {
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

Deno.test("客户机管理 - 更新名称为空：拒绝修改", () => {
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

Deno.test("客户机管理 - 发送消息：JSON序列化后发送", () => {
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

Deno.test("客户机管理 - 发送消息：socket为空时不报错", () => {
  const mgr = new ClientManager();
  mgr.sendWSMessage(undefined, { type: "test" });
});

Deno.test("客户机管理 - 消息分发：ping优先处理，其他派发给处理器", () => {
  const mgr = new ClientManager();
  let handledType = "";
  mgr.addWSMessageHandler((_client, _socket, message) => {
    handledType = message.type;
  });

  const socket = makeFakeSocket();
  const client = mgr.connectClient("10.0.0.7", socket);

  mgr.processWebSocketMessageIn(client, socket, { type: "custom_event" });
  assertEquals(handledType, "custom_event");
});

Deno.test("客户机管理 - 按视觉IP查找客户机：匹配返回", () => {
  const mgr = new ClientManager();
  const client = mgr.connectClient("10.0.0.8", makeFakeSocket());
  client.cvClient = { clientType: "jetson_nano", ip: "192.168.1.100" };

  const result = mgr.findClientsByCvIp("192.168.1.100");
  assertEquals(result.length, 1);
  assertEquals(result[0].id, client.id);
});

Deno.test("客户机管理 - 按视觉IP查找客户机：不存在时自动绑定", () => {
  const mgr = new ClientManager();
  mgr.connectClient("10.0.0.9", makeFakeSocket());

  const result = mgr.findClientsByCvIp("192.168.1.200");
  assert(result.length > 0);
  assertEquals(result[0].cvClient!.ip, "192.168.1.200");
  assertExists(mgr.cvClients["192.168.1.200"]);
});

Deno.test("客户机管理 - 按视觉IP查找单个客户机：返回第一个或 null", () => {
  const mgr = new ClientManager();
  const client = mgr.connectClient("10.0.0.10", makeFakeSocket());
  client.cvClient = { clientType: "esp32cam", ip: "192.168.1.50" };

  const found = mgr.findClientByCvIp("192.168.1.50");
  assertExists(found);
  assertEquals(found!.id, client.id);

  const notFound = mgr.findClientByCvIp("192.168.1.999");
  assertEquals(notFound, null);
});

Deno.test("客户机管理 - 新连接匹配配置文件：自动绑定视觉客户机", () => {
  const mgr = new ClientManager();
  const client = mgr.connectClient("127.0.0.1", makeFakeSocket());

  assertExists(client.cvClient);
  assertEquals(client.cvClient!.ip, "192.168.11.121");
  assertEquals(client.cvClient!.clientType, "jetson_nano");
  assertExists(mgr.cvClients["192.168.11.121"]);
});

Deno.test("客户机管理 - 不匹配配置文件：自动绑定已有视觉客户机", () => {
  const mgr = new ClientManager();
  mgr.connectClient("127.0.0.1", makeFakeSocket());

  const client = mgr.connectClient("10.0.0.99", makeFakeSocket());
  assertExists(client.cvClient, "非映射IP应通过fallback绑定第一个cvClient");
  assertEquals(client.cvClient!.ip, "192.168.11.121");
});

Deno.test("客户机管理 - 发送消息：send 报错时不影响后续", () => {
  const mgr = new ClientManager();
  const badSocket = {
    send: () => { throw new Error("send failed"); },
  } as unknown as WebSocket;

  mgr.sendWSMessage(badSocket, { type: "test" });
});

Deno.test("客户机管理 - 未注册处理器时：未知消息类型静默忽略", () => {
  const mgr = new ClientManager();
  const socket = makeFakeSocket();
  const client = mgr.connectClient("10.0.0.11", socket);

  mgr.processWebSocketMessageIn(client, socket, { type: "unknown_type" });
  assertEquals(client.socket, socket);
});

Deno.test("客户机管理 - 心跳超时：20秒无ping自动断开", async () => {
  const mgr = new ClientManager();
  const client = mgr.connectClient("10.0.0.99", makeFakeSocket());

  client.lastPing = getSecondTimestamp() - 20;

  mgr.startHeartbeat();

  await new Promise(r => setTimeout(r, 2100));

  assertEquals(client.online, false);
  assertEquals(client.socket, undefined);

  mgr.stopHeartbeat();
});

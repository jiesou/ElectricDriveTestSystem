/**
 * ClientManager单元测试
 */

import { assertEquals, assertExists } from "@std/assert";
import { ClientManager } from "./ClientManager.ts";
import { Client } from "./types.ts";

Deno.test("ClientManager - 创建新客户端", () => {
  const manager = new ClientManager();
  
  // 模拟WebSocket
  const mockSocket = {
    readyState: 1, // OPEN
    send: () => {},
    close: () => {},
  } as unknown as WebSocket;
  
  const client = manager.connectClient("192.168.1.100", mockSocket);
  
  assertExists(client);
  assertEquals(client.ip, "192.168.1.100");
  assertEquals(client.online, true);
  assertEquals(client.name, "192.168.1.100"); // 默认名称为IP
  assertExists(client.lastPing);
  
  // 清理
  manager.cleanup();
});

Deno.test("ClientManager - 重连现有客户端", () => {
  const manager = new ClientManager();
  
  const mockSocket1 = {
    readyState: 1,
    send: () => {},
    close: () => {},
  } as unknown as WebSocket;
  
  const mockSocket2 = {
    readyState: 1,
    send: () => {},
    close: () => {},
  } as unknown as WebSocket;
  
  // 首次连接
  const client1 = manager.connectClient("192.168.1.100", mockSocket1);
  const clientId = client1.id;
  
  // 断开
  manager.disconnectClient(client1);
  assertEquals(client1.online, false);
  
  // 重连（同一IP）
  const client2 = manager.connectClient("192.168.1.100", mockSocket2);
  
  // 应该是同一个客户端对象
  assertEquals(client2.id, clientId);
  assertEquals(client2.online, true);
  
  manager.cleanup();
});

Deno.test("ClientManager - CV客户端关联", () => {
  const manager = new ClientManager();
  
  const mockSocket = {
    readyState: 1,
    send: () => {},
    close: () => {},
  } as unknown as WebSocket;
  
  // 使用配置文件中的IP（如果存在）
  const client = manager.connectClient("192.168.1.100", mockSocket);
  
  // cvClient可能存在也可能不存在，取决于配置文件
  if (client.cvClient) {
    assertExists(client.cvClient.ip);
    assertExists(client.cvClient.clientType);
  }
  
  manager.cleanup();
});

Deno.test("ClientManager - 断开客户端", () => {
  const manager = new ClientManager();
  
  const mockSocket = {
    readyState: 1,
    send: () => {},
    close: () => {},
  } as unknown as WebSocket;
  
  const client = manager.connectClient("192.168.1.100", mockSocket);
  assertEquals(client.online, true);
  
  manager.disconnectClient(client);
  
  assertEquals(client.online, false);
  assertEquals(client.socket, undefined);
  assertEquals(client.lastPing, undefined);
  
  manager.cleanup();
});

Deno.test("ClientManager - 清除所有客户端", () => {
  const manager = new ClientManager();
  
  const mockSocket = {
    readyState: 1,
    send: () => {},
    close: () => {},
  } as unknown as WebSocket;
  
  // 创建多个客户端
  manager.connectClient("192.168.1.100", mockSocket);
  manager.connectClient("192.168.1.101", mockSocket);
  manager.connectClient("192.168.1.102", mockSocket);
  
  const clearedCount = manager.clearAllClients();
  
  assertEquals(clearedCount, 3);
  assertEquals(Object.keys(manager.clients).length, 0);
  
  manager.cleanup();
});

Deno.test("ClientManager - safeSend处理关闭的socket", () => {
  const manager = new ClientManager();
  
  // 模拟已关闭的socket
  const closedSocket = {
    readyState: 3, // CLOSED
    send: () => {
      throw new Error("Socket is closed");
    },
  } as unknown as WebSocket;
  
  // 不应该抛出异常
  manager.safeSend(closedSocket, { type: "test" });
  
  manager.cleanup();
});

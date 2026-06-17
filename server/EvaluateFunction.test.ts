import { assertEquals, assertExists } from "@std/assert";
import { clientManager } from "./ClientManager.ts";
import "./EvaluateFunction.ts";

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

function makeFakeSocketWithCapture(): { socket: WebSocket; messages: string[] } {
  const messages: string[] = [];
  const socket = {
    readyState: WebSocket.OPEN,
    send: (data: string | ArrayBufferLike | Blob) => { messages.push(data.toString()); },
    close: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as unknown as WebSocket;
  return { socket, messages };
}

Deno.test("功能评估 - WebSocket收到功能板更新：正确存储到客户机", () => {
  const socket = makeFakeSocket();
  const client = clientManager.connectClient("10.0.0.1", socket);

  clientManager.processWebSocketMessageIn(client, socket, {
    type: "evaluate_function_board_update_request",
    description: "测试电路",
    function_steps: [
      { description: "步骤1", can_wait_for_ms: 5000, waited_for_ms: 1000, passed: true, finished: true },
      { description: "步骤2", can_wait_for_ms: 5000, waited_for_ms: 3000, passed: false, finished: true },
    ],
  });

  assertExists(client.evaluateBoard);
  assertEquals(client.evaluateBoard!.description, "测试电路");
  assertEquals(client.evaluateBoard!.function_steps.length, 2);

  delete clientManager.clients[client.id];
});

Deno.test("功能评估 - 有步骤失败时：设置小新状态为需要排故M1", () => {
  const socket = makeFakeSocket();
  const client = clientManager.connectClient("10.0.0.2", socket);
  client.cvClient = { clientType: "jetson_nano", ip: "192.168.1.1" };

  clientManager.processWebSocketMessageIn(client, socket, {
    type: "evaluate_function_board_update_request",
    description: "测试电路",
    function_steps: [
      { description: "步骤1", can_wait_for_ms: 5000, waited_for_ms: 1000, passed: true, finished: true },
      { description: "步骤2", can_wait_for_ms: 5000, waited_for_ms: 5000, passed: false, finished: true },
    ],
  });

  assertExists(client.cvClient!.xiaoxin_status);
  assertEquals(client.cvClient!.xiaoxin_status!.type, "evaluate_need_troubleshoot");
  const status = client.cvClient!.xiaoxin_status! as any;
  assertEquals(status.evaluate_need_troubleshoot_type, "M1_NOT_START");

  delete clientManager.clients[client.id];
});

Deno.test("功能评估 - 全部步骤通过时：小新状态为正在检查", () => {
  const socket = makeFakeSocket();
  const client = clientManager.connectClient("10.0.0.3", socket);
  client.cvClient = { clientType: "jetson_nano", ip: "192.168.1.1" };

  clientManager.processWebSocketMessageIn(client, socket, {
    type: "evaluate_function_board_update_request",
    description: "测试电路",
    function_steps: [
      { description: "步骤1", can_wait_for_ms: 5000, waited_for_ms: 1000, passed: true, finished: true },
      { description: "步骤2", can_wait_for_ms: 5000, waited_for_ms: 2000, passed: true, finished: true },
    ],
  });

  assertExists(client.cvClient!.xiaoxin_status);
  assertEquals(client.cvClient!.xiaoxin_status!.type, "status_text_update");
  assertEquals((client.cvClient!.xiaoxin_status! as any).status_text, "我在检查你的功能！");

  delete clientManager.clients[client.id];
});

Deno.test("功能评估 - 请求YOLO装接评估：有视觉客户端时创建会话", () => {
  const socket = makeFakeSocket();
  const client = clientManager.connectClient("10.0.0.4", socket);
  client.cvClient = { clientType: "jetson_nano", ip: "192.168.1.1" };

  clientManager.processWebSocketMessageIn(client, socket, {
    type: "evaluate_wiring_yolo_request",
  });

  assertExists(client.cvClient!.session);
  assertEquals(client.cvClient!.session!.type, "evaluate_wiring");

  delete clientManager.clients[client.id];
});

Deno.test("功能评估 - 请求YOLO装接评估：无视觉客户端时报错", () => {
  const { socket, messages } = makeFakeSocketWithCapture();
  const client = clientManager.connectClient("10.0.0.5", socket);

  clientManager.processWebSocketMessageIn(client, socket, {
    type: "evaluate_wiring_yolo_request",
  });

  assertEquals(messages.length, 1);
  const parsed = JSON.parse(messages[0]);
  assertEquals(parsed.type, "error");
  assertEquals(parsed.message, "No CV client configured");

  delete clientManager.clients[client.id];
});

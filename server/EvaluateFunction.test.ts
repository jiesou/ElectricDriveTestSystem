import { assertEquals, assertExists } from "@std/assert";
import { clientManager } from "./ClientManager.ts";
import { getSecondTimestamp } from "./types.ts";
// 注册 WSMessageHandler（EvaluateFunction.ts 的模块级代码调用 clientManager.addWSMessageHandler）
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

Deno.test("evaluate_function_board_update_request stores board on client via WS handler", () => {
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

Deno.test("evaluate_function_board_update_request with failed steps sets troubleshoot status", () => {
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

Deno.test("evaluate_function_board_update_request without failed steps shows status_text_update", () => {
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

Deno.test("evaluate_wiring_yolo_request starts session when cvClient exists", () => {
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

Deno.test("evaluate_wiring_yolo_request sends error when no cvClient", () => {
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

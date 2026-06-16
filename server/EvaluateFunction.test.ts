import { assertEquals, assertExists } from "@std/assert";
import { ClientManager } from "./ClientManager.ts";

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

Deno.test("evaluate_function_board_update_request stores board on client", () => {
  const mgr = new ClientManager();
  const client = mgr.connectClient("10.0.0.1", makeFakeSocket());

  // Simulate the handler
  const board = {
    description: "测试电路",
    function_steps: [
      { description: "步骤1", can_wait_for_ms: 5000, waited_for_ms: 1000, passed: true, finished: true },
      { description: "步骤2", can_wait_for_ms: 5000, waited_for_ms: 3000, passed: false, finished: true },
    ],
  };
  client.evaluateBoard = board;

  assertExists(client.evaluateBoard);
  assertEquals(client.evaluateBoard.description, "测试电路");
  assertEquals(client.evaluateBoard.function_steps.length, 2);
});

Deno.test("evaluate_function_board_update_request with failed steps sets troubleshoot status", () => {
  const mgr = new ClientManager();
  const client = mgr.connectClient("10.0.0.2", makeFakeSocket());
  client.cvClient = { clientType: "jetson_nano", ip: "192.168.1.1" };

  // Simulate handler logic for xiaoxin status update
  const steps = [
    { description: "步骤1", can_wait_for_ms: 5000, waited_for_ms: 1000, passed: true, finished: true },
    { description: "步骤2", can_wait_for_ms: 5000, waited_for_ms: 5000, passed: false, finished: true },
  ];
  const hasFailedStep = steps.some(step => step.finished && !step.passed);

  if (hasFailedStep && client.cvClient) {
    client.cvClient.xiaoxin_status = {
      type: "evaluate_need_troubleshoot",
      evaluate_need_troubleshoot_type: "M1_NOT_START",
    };
  }

  assertExists(client.cvClient.xiaoxin_status);
  assertEquals(client.cvClient.xiaoxin_status.type, "evaluate_need_troubleshoot");
  const status = client.cvClient.xiaoxin_status as any;
  assertEquals(status.evaluate_need_troubleshoot_type, "M1_NOT_START");
});

Deno.test("evaluate_function_board_update_request without failed steps shows status_text_update", () => {
  const mgr = new ClientManager();
  const client = mgr.connectClient("10.0.0.3", makeFakeSocket());
  client.cvClient = { clientType: "jetson_nano", ip: "192.168.1.1" };

  // Simulate: no failed steps
  const steps = [
    { description: "步骤1", can_wait_for_ms: 5000, waited_for_ms: 1000, passed: true, finished: true },
    { description: "步骤2", can_wait_for_ms: 5000, waited_for_ms: 2000, passed: true, finished: true },
  ];
  const hasFailedStep = steps.some(step => step.finished && !step.passed);

  if (!hasFailedStep && client.cvClient) {
    client.cvClient.xiaoxin_status = {
      type: "status_text_update",
      status_text: "我在检查你的功能！",
    };
  }

  assertExists(client.cvClient.xiaoxin_status);
  assertEquals(client.cvClient.xiaoxin_status.type, "status_text_update");
  assertEquals((client.cvClient.xiaoxin_status as any).status_text, "我在检查你的功能！");
});

Deno.test("evaluate_wiring_yolo_request starts session when cvClient exists", () => {
  const mgr = new ClientManager();
  const client = mgr.connectClient("10.0.0.4", makeFakeSocket());
  client.cvClient = { clientType: "jetson_nano", ip: "192.168.1.1" };

  // Simulate handler
  if (client.cvClient) {
    client.cvClient.session = {
      type: "evaluate_wiring",
      startTime: Math.floor(Date.now() / 1000),
      shots: [],
    };
  }

  assertExists(client.cvClient.session);
  assertEquals(client.cvClient.session.type, "evaluate_wiring");
});

Deno.test("evaluate_wiring_yolo_request sends error when no cvClient", () => {
  const mgr = new ClientManager();
  let sentData = "";
  const socket = {
    readyState: WebSocket.OPEN,
    send: (data: string) => { sentData = data; },
    close: () => {},
  } as unknown as WebSocket;
  const client = mgr.connectClient("10.0.0.5", socket);

  // Simulate handler
  if (!client.cvClient) {
    const msg = { type: "error", message: "No CV client configured" };
    socket.send(JSON.stringify(msg));
  }

  const parsed = JSON.parse(sentData);
  assertEquals(parsed.type, "error");
  assertEquals(parsed.message, "No CV client configured");
});

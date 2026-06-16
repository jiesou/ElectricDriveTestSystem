import { assertEquals, assert, assertExists } from "@std/assert";
import { TroubleTest } from "./TroubleTest.ts";
import { getSecondTimestamp, TROUBLES } from "./types.ts";
import { ClientManager, clientManager } from "./ClientManager.ts";

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

Deno.test("getTroubles returns copy of TROUBLES", () => {
  const tt = new TroubleTest();
  const troubles = tt.getTroubles();
  assertEquals(troubles.length, TROUBLES.length);
  assertEquals(troubles[0].id, TROUBLES[0].id);
  // Should be a copy, not the same reference
  troubles[0] = { ...troubles[0], description: "modified" };
  assert(troubles[0].description !== TROUBLES[0].description);
});

Deno.test("addQuestion adds and returns question with auto-incremented id", async () => {
  const tt = new TroubleTest();
  const existingCount = tt.questions.length;
  const maxExistingId = existingCount > 0
    ? Math.max(...tt.questions.map((q) => q.id))
    : 0;

  const q = await tt.addQuestion({
    troubles: [
      { id: 1, description: "test", from_wire: 1, to_wire: 2 },
    ],
  });

  assertExists(q.id);
  assertEquals(q.id, maxExistingId + 1);
  assertEquals(q.troubles.length, 1);
  assertEquals(tt.questions.length, existingCount + 1);
});

Deno.test("addQuestion auto-increments id", async () => {
  const tt = new TroubleTest();
  const q1 = await tt.addQuestion({ troubles: [{ id: 1, description: "a", from_wire: 1, to_wire: 2 }] });
  const q2 = await tt.addQuestion({ troubles: [{ id: 2, description: "b", from_wire: 3, to_wire: 4 }] });

  assertEquals(q2.id, q1.id + 1);
});

Deno.test("updateQuestion updates existing question", async () => {
  const tt = new TroubleTest();
  const q = await tt.addQuestion({ troubles: [{ id: 1, description: "old", from_wire: 1, to_wire: 2 }] });

  const result = await tt.updateQuestion(q.id, {
    troubles: [{ id: 2, description: "new", from_wire: 3, to_wire: 4 }],
  });

  assert(result);
  const updated = tt.questions.find((x) => x.id === q.id)!;
  assertEquals(updated.troubles[0].description, "new");
});

Deno.test("updateQuestion returns false for non-existent id", async () => {
  const tt = new TroubleTest();
  const result = await tt.updateQuestion(99999, { troubles: [] });
  assertEquals(result, false);
});

Deno.test("deleteQuestion removes existing question", async () => {
  const tt = new TroubleTest();
  const existingCount = tt.questions.length;
  const q = await tt.addQuestion({ troubles: [{ id: 1, description: "del", from_wire: 1, to_wire: 2 }] });

  const result = await tt.deleteQuestion(q.id);
  assert(result);
  assertEquals(tt.questions.length, existingCount);
});

Deno.test("deleteQuestion returns false for non-existent id", async () => {
  const tt = new TroubleTest();
  const result = await tt.deleteQuestion(99999);
  assertEquals(result, false);
});

Deno.test("createTest creates and stores a test", async () => {
  const tt = new TroubleTest();
  const questions = [
    { id: 1, troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }] },
  ];
  const startTime = getSecondTimestamp();

  const test = await tt.createTest(questions, startTime, 600);

  assertExists(test.id);
  assertEquals(test.questions.length, 1);
  assertEquals(test.startTime, startTime);
  assertEquals(test.durationTime, 600);
  assertEquals(tt.tests.length, 1);
});

Deno.test("createTestSession creates session and pushes test to client", async () => {
  const tt = new TroubleTest();
  const mgr = new ClientManager();
  const socket = makeFakeSocket();
  const client = mgr.connectClient("10.0.0.1", socket);
  const test = await tt.createTest(
    [{ id: 1, troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }] }],
    getSecondTimestamp(),
  );

  const result = tt.createTestSession(client, test);

  assert(result);
  assertExists(client.testSession);
  assertEquals(client.testSession.test.questions.length, 1);
});

Deno.test("createTestSession sets xiaoxin status when cvClient exists", async () => {
  const tt = new TroubleTest();
  const mgr = new ClientManager();
  const client = mgr.connectClient("10.0.0.2", makeFakeSocket());
  client.cvClient = { clientType: "jetson_nano", ip: "192.168.1.1" };
  const test = await tt.createTest(
    [{ id: 1, troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }] }],
    getSecondTimestamp(),
  );

  tt.createTestSession(client, test);

  assertExists(client.cvClient.xiaoxin_status);
  assertEquals(client.cvClient.xiaoxin_status.type, "status_text_update");
});

Deno.test("finishTest sets finishTime and clears xiaoxin status", async () => {
  const tt = new TroubleTest();
  const mgr = new ClientManager();
  const client = mgr.connectClient("10.0.0.3", makeFakeSocket());
  client.cvClient = { clientType: "jetson_nano", ip: "192.168.1.1" };
  client.cvClient.xiaoxin_status = { type: "status_text_update", status_text: "testing" };
  const test = await tt.createTest(
    [{ id: 1, troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }] }],
    getSecondTimestamp(),
  );
  tt.createTestSession(client, test);

  const finishTs = getSecondTimestamp();
  tt.finishTest(client, finishTs);

  assertEquals(client.testSession!.finishTime, finishTs);
  assertEquals(client.cvClient.xiaoxin_status, undefined);
});

Deno.test("finishTest handles null client gracefully", () => {
  const tt = new TroubleTest();
  // Should not throw
  tt.finishTest(null as unknown as any);
});

Deno.test("pushTestToClient sends WebSocket message", async () => {
  const tt = new TroubleTest();
  let sentData = "";
  const socket = {
    readyState: WebSocket.OPEN,
    send: (data: string) => { sentData = data; },
    close: () => {},
  } as unknown as WebSocket;

  const mgr = new ClientManager();
  const client = mgr.connectClient("10.0.0.4", socket);
  const test = await tt.createTest(
    [{ id: 1, troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }] }],
    getSecondTimestamp(),
  );

  tt.pushTestToClient(client, test);

  const msg = JSON.parse(sentData);
  assertEquals(msg.type, "trouble_test_push");
  assertEquals(msg.all_questions.length, 1);
});

Deno.test("trouble_test_update_request generates AnswerLog diff", () => {
  const tt = new TroubleTest();
  const mgr = new ClientManager();

  // Create a client with an existing test session
  const client = mgr.connectClient("10.0.0.5", makeFakeSocket());
  const question1 = {
    id: 1,
    troubles: [
      { id: 10, description: "wire A-B", from_wire: 1, to_wire: 2, submitted_from_wire: null, submitted_to_wire: null, submitted_correct: null },
    ],
  };

  client.testSession = {
    id: "session-1",
    test: {
      id: 100,
      questions: [question1],
      startTime: getSecondTimestamp(),
      durationTime: null,
    },
    logs: [],
  };

  // Simulate WS message handler dispatch
  const handler = new TroubleTest();
  // Process the update request through clientManager's handler
  const timestamp = getSecondTimestamp();
  const updatedQuestions = [
    {
      id: 1,
      troubles: [
        { id: 10, description: "wire A-B", from_wire: 1, to_wire: 2, submitted_from_wire: 3, submitted_to_wire: 4, submitted_correct: true },
      ],
    },
  ];

  // We can't easily trigger the addWSMessageHandler registered in TroubleTest module scope,
  // so we test the diff logic manually by simulating what the handler does.
  const oldQuestions = client.testSession.test.questions;
  const newQuestions = updatedQuestions;
  const logsBefore = client.testSession.logs.length;

  newQuestions.forEach((newQ, qIdx) => {
    const oldQ = oldQuestions[qIdx];
    if (!oldQ) return;
    newQ.troubles.forEach((newT) => {
      if (!newT.submitted_from_wire && !newT.submitted_to_wire) return;
      const oldT = oldQ.troubles.find((t) => t.id === newT.id);
      if (!oldT) return;
      if (newT.submitted_from_wire !== oldT.submitted_from_wire ||
          newT.submitted_to_wire !== oldT.submitted_to_wire ||
          newT.submitted_correct !== oldT.submitted_correct) {
        client.testSession!.logs.push({
          timestamp: timestamp,
          action: "answer" as const,
          details: {
            question: newQ,
            trouble: {
              id: newT.id,
              description: newT.description,
              from_wire: newT.from_wire,
              to_wire: newT.to_wire,
              submitted_from_wire: newT.submitted_from_wire,
              submitted_to_wire: newT.submitted_to_wire,
            },
            isCorrect: newT.submitted_correct || false,
          },
        });
      }
    });
  });

  assertEquals(client.testSession.logs.length, logsBefore + 1);
  assertEquals(client.testSession.logs[logsBefore].action, "answer");
  const answerLog = client.testSession.logs[logsBefore] as any;
  assertEquals(answerLog.details.trouble.id, 10);
  assertEquals(answerLog.details.isCorrect, true);
});

Deno.test("trouble_test_update_request with finish_time creates FinishLog", () => {
  const tt = new TroubleTest();
  const mgr = new ClientManager();
  const client = mgr.connectClient("10.0.0.6", makeFakeSocket());

  client.testSession = {
    id: "session-2",
    test: {
      id: 101,
      questions: [{ id: 1, troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }] }],
      startTime: getSecondTimestamp(),
      durationTime: null,
    },
    logs: [],
  };

  // Simulate the handler logic for finish
  const finishTs = getSecondTimestamp();
  if (finishTs && !client.testSession.logs.some((l) => l.action === "finish")) {
    client.testSession.logs.push({
      timestamp: finishTs,
      action: "finish" as const,
      details: { score: 85 },
    });
  }

  assertEquals(client.testSession.logs.length, 1);
  assertEquals(client.testSession.logs[0].action, "finish");
  const finishLog = client.testSession.logs[0] as any;
  assertEquals(finishLog.details.score, 85);
});

Deno.test("createTest without durationTime sets null", async () => {
  const tt = new TroubleTest();
  const test = await tt.createTest(
    [], getSecondTimestamp(),
  );
  assertEquals(test.durationTime, null);
});

Deno.test("createTest with specific durationTime", async () => {
  const tt = new TroubleTest();
  const test = await tt.createTest(
    [], getSecondTimestamp(), 300,
  );
  assertEquals(test.durationTime, 300);
});

Deno.test("questions getter returns a copy", () => {
  const tt = new TroubleTest();
  const qs = tt.questions;
  const qs2 = tt.questions;
  // Should be different references each time
  assert(qs !== qs2);
});

// ==================== WS Handler Tests ====================

function makeFakeSocketWithCapture(): { socket: WebSocket; messages: string[] } {
  const messages: string[] = [];
  const socket = {
    readyState: WebSocket.OPEN,
    send: (data: string | ArrayBufferLike | Blob) => {
      messages.push(data.toString());
    },
    close: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as unknown as WebSocket;
  return { socket, messages };
}

Deno.test({
  name: "WS handler trouble_test_pull_request with active session pushes test to client",
  fn() {
    const { socket, messages } = makeFakeSocketWithCapture();
    const client = clientManager.connectClient("10.0.0.120", socket);
    client.testSession = {
      id: "ws-pull-session-1",
      test: {
        id: 200,
        questions: [{ id: 1, troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }] }],
        startTime: getSecondTimestamp(),
        durationTime: null,
      },
      logs: [],
    };

    clientManager.processWebSocketMessageIn(
      client, socket, { type: "trouble_test_pull_request" },
    );

    assert(messages.length > 0);
    const msg = JSON.parse(messages[0]);
    assertEquals(msg.type, "trouble_test_push");
    assertEquals(msg.all_questions.length, 1);

    delete clientManager.clients[client.id];
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "WS handler trouble_test_pull_request with finished session is no-op",
  fn() {
    const { socket, messages } = makeFakeSocketWithCapture();
    const client = clientManager.connectClient("10.0.0.121", socket);
    client.testSession = {
      id: "ws-pull-session-2",
      test: {
        id: 201,
        questions: [{ id: 1, troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }] }],
        startTime: getSecondTimestamp(),
        durationTime: null,
      },
      finishTime: getSecondTimestamp(),
      logs: [],
    };

    clientManager.processWebSocketMessageIn(
      client, socket, { type: "trouble_test_pull_request" },
    );

    assertEquals(messages.length, 0);

    delete clientManager.clients[client.id];
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "WS handler trouble_test_pull_request without session is no-op",
  fn() {
    const { socket, messages } = makeFakeSocketWithCapture();
    const client = clientManager.connectClient("10.0.0.122", socket);

    clientManager.processWebSocketMessageIn(
      client, socket, { type: "trouble_test_pull_request" },
    );

    assertEquals(messages.length, 0);

    delete clientManager.clients[client.id];
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "WS handler trouble_test_update_request generates AnswerLog diff",
  fn() {
    const { socket } = makeFakeSocketWithCapture();
    const client = clientManager.connectClient("10.0.0.123", socket);
    const ts = getSecondTimestamp();

    client.testSession = {
      id: "ws-update-diff-1",
      test: {
        id: 300,
        questions: [{
          id: 1,
          troubles: [
            { id: 10, description: "wire A-B", from_wire: 1, to_wire: 2, submitted_from_wire: null, submitted_to_wire: null, submitted_correct: null },
          ],
        }],
        startTime: ts,
        durationTime: null,
      },
      logs: [],
    };

    clientManager.processWebSocketMessageIn(
      client, socket, {
        type: "trouble_test_update_request",
        all_questions: [{
          id: 1,
          troubles: [
            { id: 10, description: "wire A-B", from_wire: 1, to_wire: 2, submitted_from_wire: 3, submitted_to_wire: 4, submitted_correct: true },
          ],
        }],
        start_time: ts,
        duration_time: null,
        timestamp: ts,
      },
    );

    assertEquals(client.testSession!.logs.length, 1);
    assertEquals(client.testSession!.logs[0].action, "answer");
    const answerLog = client.testSession!.logs[0] as { details: { trouble: { id: number }; isCorrect: boolean } };
    assertEquals(answerLog.details.trouble.id, 10);
    assertEquals(answerLog.details.isCorrect, true);

    delete clientManager.clients[client.id];
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "WS handler trouble_test_update_request with finish_time adds FinishLog and calls finishTest",
  fn() {
    const { socket } = makeFakeSocketWithCapture();
    const client = clientManager.connectClient("10.0.0.124", socket);
    const ts = getSecondTimestamp();

    client.testSession = {
      id: "ws-update-finish-1",
      test: {
        id: 301,
        questions: [{ id: 1, troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }] }],
        startTime: ts,
        durationTime: null,
      },
      logs: [],
    };

    const finishTs = getSecondTimestamp() + 60;
    clientManager.processWebSocketMessageIn(
      client, socket, {
        type: "trouble_test_update_request",
        all_questions: [{ id: 1, troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }] }],
        start_time: ts,
        duration_time: null,
        finish_time: finishTs,
        finished_score: 85,
        timestamp: ts,
      },
    );

    const finishLogs = client.testSession!.logs.filter((l) => l.action === "finish");
    assertEquals(finishLogs.length, 1);
    assertEquals(client.testSession!.finishTime, finishTs);
    assertEquals(client.testSession!.finishedScore, 85);

    delete clientManager.clients[client.id];
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "WS handler trouble_test_update_request creates new session when none exists",
  fn() {
    const { socket } = makeFakeSocketWithCapture();
    const client = clientManager.connectClient("10.0.0.125", socket);
    const ts = getSecondTimestamp();

    clientManager.processWebSocketMessageIn(
      client, socket, {
        type: "trouble_test_update_request",
        all_questions: [{ id: 1, troubles: [{ id: 1, description: "new session", from_wire: 1, to_wire: 2 }] }],
        start_time: ts,
        duration_time: null,
        timestamp: ts,
      },
    );

    assertExists(client.testSession);
    assertEquals(client.testSession!.test.questions.length, 1);
    assertEquals(client.testSession!.logs.length, 1);
    assertEquals(client.testSession!.logs[0].action, "start");

    delete clientManager.clients[client.id];
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "WS handler trouble_test_update_request creates new session with finish_time",
  fn() {
    const { socket } = makeFakeSocketWithCapture();
    const client = clientManager.connectClient("10.0.0.126", socket);
    const ts = getSecondTimestamp();
    const finishTs = getSecondTimestamp() + 60;

    clientManager.processWebSocketMessageIn(
      client, socket, {
        type: "trouble_test_update_request",
        all_questions: [{ id: 1, troubles: [{ id: 1, description: "finish right away", from_wire: 1, to_wire: 2 }] }],
        start_time: ts,
        duration_time: null,
        finish_time: finishTs,
        finished_score: 75,
        timestamp: ts,
      },
    );

    assertExists(client.testSession);
    assertEquals(client.testSession!.logs.length, 2);
    assertEquals(client.testSession!.logs[0].action, "start");
    assertEquals(client.testSession!.logs[1].action, "finish");
    assertEquals(client.testSession!.finishTime, finishTs);
    assertEquals(client.testSession!.finishedScore, 75);

    delete clientManager.clients[client.id];
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "WS handler trouble_test_update_request does not duplicate FinishLog",
  fn() {
    const { socket } = makeFakeSocketWithCapture();
    const client = clientManager.connectClient("10.0.0.127", socket);
    const ts = getSecondTimestamp();

    client.testSession = {
      id: "ws-update-no-dupe",
      test: {
        id: 302,
        questions: [{ id: 1, troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }] }],
        startTime: ts,
        durationTime: null,
      },
      logs: [{ timestamp: ts, action: "finish", details: { score: 80 } }],
      finishTime: ts,
      finishedScore: 80,
    };

    clientManager.processWebSocketMessageIn(
      client, socket, {
        type: "trouble_test_update_request",
        all_questions: [{ id: 1, troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }] }],
        start_time: ts,
        duration_time: null,
        finish_time: getSecondTimestamp() + 60,
        finished_score: 85,
        timestamp: ts,
      },
    );

    const finishLogs = client.testSession!.logs.filter((l) => l.action === "finish");
    assertEquals(finishLogs.length, 1);

    delete clientManager.clients[client.id];
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

import { assert, assertEquals, assertExists } from "@std/assert";
import { troubleTest } from "./TroubleTest.ts";
import { getSecondTimestamp } from "../../utils/helpers.ts";
import { TROUBLES } from "../../types.ts";
import { clientManager } from "./ClientManager.ts";
import { prisma } from "../../prisma/client.ts";

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

Deno.test("排故测验 - 获取故障列表：返回的是副本，修改后不影响原数据", () => {
  const troubles = troubleTest.getTroubles();
  assertEquals(troubles.length, TROUBLES.length);
  assertEquals(troubles[0].id, TROUBLES[0].id);
  troubles[0] = { ...troubles[0], description: "modified" };
  assert(troubles[0].description !== TROUBLES[0].description);
});

Deno.test("排故测验 - 新增题目：自动分配递增编号，成功返回", async () => {
  const existingCount = troubleTest.questions.length;
  const maxExistingId = existingCount > 0
    ? Math.max(...troubleTest.questions.map((q) => q.id))
    : 0;

  const q = await troubleTest.addQuestion({
    troubles: [
      { id: 1, description: "test", from_wire: 1, to_wire: 2 },
    ],
  });

  assertExists(q.id);
  assertEquals(q.id, maxExistingId + 1);
  assertEquals(q.troubles.length, 1);
  assertEquals(troubleTest.questions.length, existingCount + 1);

  await prisma.storedQuestion.delete({ where: { id: q.id } }).catch(() => {});
});

Deno.test("排故测验 - 连续新增：编号递增", async () => {
  const q1 = await troubleTest.addQuestion({
    troubles: [{ id: 1, description: "a", from_wire: 1, to_wire: 2 }],
  });
  const q2 = await troubleTest.addQuestion({
    troubles: [{ id: 2, description: "b", from_wire: 3, to_wire: 4 }],
  });

  assertEquals(q2.id, q1.id + 1);

  await prisma.storedQuestion.delete({ where: { id: q1.id } }).catch(() => {});
  await prisma.storedQuestion.delete({ where: { id: q2.id } }).catch(() => {});
});

Deno.test("排故测验 - 更新题目：内容成功修改", async () => {
  const q = await troubleTest.addQuestion({
    troubles: [{ id: 1, description: "old", from_wire: 1, to_wire: 2 }],
  });

  const result = await troubleTest.updateQuestion(q.id, {
    troubles: [{ id: 2, description: "new", from_wire: 3, to_wire: 4 }],
  });

  assert(result);
  const updated = troubleTest.questions.find((x) => x.id === q.id)!;
  assertEquals(updated.troubles[0].description, "new");

  await prisma.storedQuestion.delete({ where: { id: q.id } }).catch(() => {});
});

Deno.test("排故测验 - 更新题目：不存在的ID返回false", async () => {
  const result = await troubleTest.updateQuestion(99999, { troubles: [] });
  assertEquals(result, false);
});

Deno.test("排故测验 - 删除题目：成功移除，数量恢复", async () => {
  const existingCount = troubleTest.questions.length;
  const q = await troubleTest.addQuestion({
    troubles: [{ id: 1, description: "del", from_wire: 1, to_wire: 2 }],
  });

  const result = await troubleTest.deleteQuestion(q.id);
  assert(result);
  assertEquals(troubleTest.questions.length, existingCount);
});

Deno.test("排故测验 - 删除题目：不存在的ID返回false", async () => {
  const result = await troubleTest.deleteQuestion(99999);
  assertEquals(result, false);
});

Deno.test("排故测验 - 创建测验：成功存储，含题目和计时", async () => {
  const questions = [
    {
      id: 1,
      troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }],
    },
  ];
  const startTime = getSecondTimestamp();

  const test = await troubleTest.createTest(questions, startTime, 600);

  assertExists(test.id);
  assertEquals(test.questions.length, 1);
  assertEquals(test.startTime, startTime);
  assertEquals(test.durationTime, 600);
  assertEquals(troubleTest.tests.length, 1);

  await prisma.storedTest.delete({ where: { id: BigInt(test.id) } }).catch(
    () => {},
  );
});

Deno.test("排故测验 - 创建测验会话：生成start日志，推送给客户机", () => {
  const socket = makeFakeSocket();
  const client = clientManager.connectClient("10.0.0.1", socket);
  const test = {
    id: Date.now(),
    questions: [{
      id: 1,
      troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }],
    }],
    startTime: getSecondTimestamp(),
    durationTime: null,
  };

  const result = troubleTest.createTestSession(client, test);

  assert(result);
  assertExists(client.testSession);
  assertEquals(client.testSession!.test.questions.length, 1);
});

Deno.test("排故测验 - 创建会话时有视觉客户端：设置小新状态为排故中", () => {
  const client = clientManager.connectClient("10.0.0.2", makeFakeSocket());
  client.cvClient = { clientType: "jetson_nano", ip: "192.168.1.1" };
  const test = {
    id: Date.now(),
    questions: [{
      id: 1,
      troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }],
    }],
    startTime: getSecondTimestamp(),
    durationTime: null,
  };

  troubleTest.createTestSession(client, test);

  assertExists(client.cvClient!.xiaoxin_status);
  assertEquals(client.cvClient!.xiaoxin_status!.type, "status_text_update");

  delete clientManager.clients[client.id];
});

Deno.test("排故测验 - 结束测验：记录完成时间，清除小新状态", () => {
  const client = clientManager.connectClient("10.0.0.3", makeFakeSocket());
  client.cvClient = { clientType: "jetson_nano", ip: "192.168.1.1" };
  client.cvClient.xiaoxin_status = {
    type: "status_text_update",
    status_text: "testing",
  };
  client.testSession = {
    id: "finish-test-1",
    test: {
      id: Date.now(),
      questions: [{
        id: 1,
        troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }],
      }],
      startTime: getSecondTimestamp(),
      durationTime: null,
    },
    logs: [],
  };

  const finishTs = getSecondTimestamp();
  troubleTest.finishTest(client, finishTs);

  assertEquals(client.testSession!.finishTime, finishTs);
  assertEquals(client.cvClient.xiaoxin_status, undefined);
});

Deno.test("排故测验 - 结束测验：客户机为空时不崩溃", () => {
  troubleTest.finishTest(null as unknown as any);
});

Deno.test("排故测验 - 推送试题：发送trouble_test_push消息", () => {
  let sentData = "";
  const socket = {
    readyState: WebSocket.OPEN,
    send: (data: string) => {
      sentData = data;
    },
    close: () => {},
  } as unknown as WebSocket;

  const client = clientManager.connectClient("10.0.0.4", socket);
  const test = {
    id: Date.now(),
    questions: [{
      id: 1,
      troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }],
    }],
    startTime: getSecondTimestamp(),
    durationTime: null,
  };

  troubleTest.pushTestToClient(client, test);

  const msg = JSON.parse(sentData);
  assertEquals(msg.type, "trouble_test_push");
  assertEquals(msg.all_questions.length, 1);
});

Deno.test("排故测验 - 创建测验：不传时长默认为null", async () => {
  const startTime = getSecondTimestamp();
  const test = await troubleTest.createTest([], startTime);
  assertEquals(test.durationTime, null);
  assertEquals(test.startTime, startTime);
  assertEquals(test.questions.length, 0);
  await prisma.storedTest.delete({ where: { id: BigInt(test.id) } }).catch(
    () => {},
  );
});

Deno.test("排故测验 - 创建测验：传入时长正确保存", async () => {
  const startTime = getSecondTimestamp();
  const test = await troubleTest.createTest([], startTime, 300);
  assertEquals(test.durationTime, 300);
  assertEquals(test.startTime, startTime);
  await prisma.storedTest.delete({ where: { id: BigInt(test.id) } }).catch(
    () => {},
  );
});

Deno.test("排故测验 - 题目列表：每次返回不同副本", () => {
  const qs = troubleTest.questions;
  const qs2 = troubleTest.questions;
  assert(qs !== qs2);
});

Deno.test("WebSocket - 请求拉取试题：有活跃会话时推送", () => {
  const { socket, messages } = makeFakeSocketWithCapture();
  const client = clientManager.connectClient("10.0.0.120", socket);
  client.testSession = {
    id: "ws-pull-session-1",
    test: {
      id: 200,
      questions: [{
        id: 1,
        troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }],
      }],
      startTime: getSecondTimestamp(),
      durationTime: null,
    },
    logs: [],
  };

  clientManager.processWebSocketMessageIn(
    client,
    socket,
    { type: "trouble_test_pull_request" },
  );

  assert(messages.length > 0);
  const msg = JSON.parse(messages[0]);
  assertEquals(msg.type, "trouble_test_push");
  assertEquals(msg.all_questions.length, 1);

  delete clientManager.clients[client.id];
});

Deno.test("WebSocket - 请求拉取试题：已完成的会话不重复推送", () => {
  const { socket, messages } = makeFakeSocketWithCapture();
  const client = clientManager.connectClient("10.0.0.121", socket);
  client.testSession = {
    id: "ws-pull-session-2",
    test: {
      id: 201,
      questions: [{
        id: 1,
        troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }],
      }],
      startTime: getSecondTimestamp(),
      durationTime: null,
    },
    finishTime: getSecondTimestamp(),
    logs: [],
  };

  clientManager.processWebSocketMessageIn(
    client,
    socket,
    { type: "trouble_test_pull_request" },
  );

  assertEquals(messages.length, 0);

  delete clientManager.clients[client.id];
});

Deno.test("WebSocket - 请求拉取试题：无会话时不做任何操作", () => {
  const { socket, messages } = makeFakeSocketWithCapture();
  const client = clientManager.connectClient("10.0.0.122", socket);

  clientManager.processWebSocketMessageIn(
    client,
    socket,
    { type: "trouble_test_pull_request" },
  );

  assertEquals(messages.length, 0);

  delete clientManager.clients[client.id];
});

Deno.test("WebSocket - 提交答案更新：正确记录AnswerLog日志", () => {
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
          {
            id: 10,
            description: "wire A-B",
            from_wire: 1,
            to_wire: 2,
            submitted_from_wire: null,
            submitted_to_wire: null,
            submitted_correct: null,
          },
        ],
      }],
      startTime: ts,
      durationTime: null,
    },
    logs: [],
  };

  clientManager.processWebSocketMessageIn(
    client,
    socket,
    {
      type: "trouble_test_update_request",
      all_questions: [{
        id: 1,
        troubles: [
          {
            id: 10,
            description: "wire A-B",
            from_wire: 1,
            to_wire: 2,
            submitted_from_wire: 3,
            submitted_to_wire: 4,
            submitted_correct: true,
          },
        ],
      }],
      start_time: ts,
      duration_time: null,
      timestamp: ts,
    },
  );

  assertEquals(client.testSession!.logs.length, 1);
  assertEquals(client.testSession!.logs[0].action, "answer");
  const answerLog = client.testSession!.logs[0] as {
    details: { trouble: { id: number }; isCorrect: boolean };
  };
  assertEquals(answerLog.details.trouble.id, 10);
  assertEquals(answerLog.details.isCorrect, true);

  delete clientManager.clients[client.id];
});

Deno.test("WebSocket - 提交答案含完成时间：记录FinishLog并结束测验", () => {
  const { socket } = makeFakeSocketWithCapture();
  const client = clientManager.connectClient("10.0.0.124", socket);
  const ts = getSecondTimestamp();

  client.testSession = {
    id: "ws-update-finish-1",
    test: {
      id: 301,
      questions: [{
        id: 1,
        troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }],
      }],
      startTime: ts,
      durationTime: null,
    },
    logs: [],
  };

  const finishTs = getSecondTimestamp() + 60;
  clientManager.processWebSocketMessageIn(
    client,
    socket,
    {
      type: "trouble_test_update_request",
      all_questions: [{
        id: 1,
        troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }],
      }],
      start_time: ts,
      duration_time: null,
      finish_time: finishTs,
      finished_score: 85,
      timestamp: ts,
    },
  );

  const finishLogs = client.testSession!.logs.filter((l) =>
    l.action === "finish"
  );
  assertEquals(finishLogs.length, 1);
  assertEquals(client.testSession!.finishTime, finishTs);
  assertEquals(client.testSession!.finishedScore, 85);

  delete clientManager.clients[client.id];
});

Deno.test("WebSocket - 主动发起测验：无会话时自动创建新会话", () => {
  const { socket } = makeFakeSocketWithCapture();
  const client = clientManager.connectClient("10.0.0.125", socket);
  const ts = getSecondTimestamp();

  clientManager.processWebSocketMessageIn(
    client,
    socket,
    {
      type: "trouble_test_update_request",
      all_questions: [{
        id: 1,
        troubles: [{
          id: 1,
          description: "new session",
          from_wire: 1,
          to_wire: 2,
        }],
      }],
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
});

Deno.test("WebSocket - 主动发起并立即交卷：日志包含start和finish", () => {
  const { socket } = makeFakeSocketWithCapture();
  const client = clientManager.connectClient("10.0.0.126", socket);
  const ts = getSecondTimestamp();
  const finishTs = getSecondTimestamp() + 60;

  clientManager.processWebSocketMessageIn(
    client,
    socket,
    {
      type: "trouble_test_update_request",
      all_questions: [{
        id: 1,
        troubles: [{
          id: 1,
          description: "finish right away",
          from_wire: 1,
          to_wire: 2,
        }],
      }],
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
});

Deno.test("WebSocket - 多次交卷：不重复创建FinishLog", () => {
  const { socket } = makeFakeSocketWithCapture();
  const client = clientManager.connectClient("10.0.0.127", socket);
  const ts = getSecondTimestamp();

  client.testSession = {
    id: "ws-update-no-dupe",
    test: {
      id: 302,
      questions: [{
        id: 1,
        troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }],
      }],
      startTime: ts,
      durationTime: null,
    },
    logs: [{ timestamp: ts, action: "finish", details: { score: 80 } }],
    finishTime: ts,
    finishedScore: 80,
  };

  clientManager.processWebSocketMessageIn(
    client,
    socket,
    {
      type: "trouble_test_update_request",
      all_questions: [{
        id: 1,
        troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }],
      }],
      start_time: ts,
      duration_time: null,
      finish_time: getSecondTimestamp() + 60,
      finished_score: 85,
      timestamp: ts,
    },
  );

  const finishLogs = client.testSession!.logs.filter((l) =>
    l.action === "finish"
  );
  assertEquals(finishLogs.length, 1);

  delete clientManager.clients[client.id];
});

Deno.test("WebSocket - 更新时不传finish_time：保留原有完成时间和分数", () => {
  const { socket } = makeFakeSocketWithCapture();
  const client = clientManager.connectClient("10.0.0.128", socket);
  const ts = getSecondTimestamp();
  const originalFinishTime = ts + 30;
  const originalScore = 90;

  client.testSession = {
    id: "ws-preserve-finish-1",
    test: {
      id: 400,
      questions: [{
        id: 1,
        troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }],
      }],
      startTime: ts,
      durationTime: null,
    },
    logs: [{
      timestamp: ts,
      action: "finish",
      details: { score: originalScore },
    }],
    finishTime: originalFinishTime,
    finishedScore: originalScore,
  };

  clientManager.processWebSocketMessageIn(
    client,
    socket,
    {
      type: "trouble_test_update_request",
      all_questions: [{
        id: 1,
        troubles: [{ id: 1, description: "t1", from_wire: 1, to_wire: 2 }],
      }],
      start_time: ts,
      duration_time: null,
      finished_score: originalScore,
      timestamp: ts,
    },
  );

  assertEquals(client.testSession!.finishTime, originalFinishTime);
  assertEquals(client.testSession!.finishedScore, originalScore);
  const finishLogs = client.testSession!.logs.filter((l) =>
    l.action === "finish"
  );
  assertEquals(finishLogs.length, 1);

  delete clientManager.clients[client.id];
});

Deno.test("WebSocket - 提交from_wire=0：视为有效答案，记录日志", () => {
  const { socket } = makeFakeSocketWithCapture();
  const client = clientManager.connectClient("10.0.0.129", socket);
  const ts = getSecondTimestamp();

  client.testSession = {
    id: "ws-zero-submit-1",
    test: {
      id: 500,
      questions: [{
        id: 1,
        troubles: [
          {
            id: 10,
            description: "wire",
            from_wire: 1,
            to_wire: 2,
            submitted_from_wire: null,
            submitted_to_wire: null,
            submitted_correct: null,
          },
        ],
      }],
      startTime: ts,
      durationTime: null,
    },
    logs: [],
  };

  clientManager.processWebSocketMessageIn(
    client,
    socket,
    {
      type: "trouble_test_update_request",
      all_questions: [{
        id: 1,
        troubles: [
          {
            id: 10,
            description: "wire",
            from_wire: 1,
            to_wire: 2,
            submitted_from_wire: 0,
            submitted_to_wire: 1,
            submitted_correct: true,
          },
        ],
      }],
      start_time: ts,
      duration_time: null,
      timestamp: ts,
    },
  );

  assertEquals(client.testSession!.logs.length, 1);
  assertEquals(client.testSession!.logs[0].action, "answer");

  delete clientManager.clients[client.id];
});

Deno.test("WebSocket - 提交为空(null/undefined)：跳过不记录日志", () => {
  const { socket } = makeFakeSocketWithCapture();
  const client = clientManager.connectClient("10.0.0.130", socket);
  const ts = getSecondTimestamp();

  client.testSession = {
    id: "ws-null-submit-1",
    test: {
      id: 501,
      questions: [{
        id: 1,
        troubles: [
          {
            id: 10,
            description: "wire",
            from_wire: 1,
            to_wire: 2,
            submitted_from_wire: null,
            submitted_to_wire: null,
            submitted_correct: null,
          },
        ],
      }],
      startTime: ts,
      durationTime: null,
    },
    logs: [],
  };

  clientManager.processWebSocketMessageIn(
    client,
    socket,
    {
      type: "trouble_test_update_request",
      all_questions: [{
        id: 1,
        troubles: [
          {
            id: 10,
            description: "wire",
            from_wire: 1,
            to_wire: 2,
            submitted_from_wire: null,
            submitted_to_wire: null,
            submitted_correct: null,
          },
        ],
      }],
      start_time: ts,
      duration_time: null,
      timestamp: ts,
    },
  );

  assertEquals(client.testSession!.logs.length, 0);

  delete clientManager.clients[client.id];
});

function makeFakeSocketWithCapture(): {
  socket: WebSocket;
  messages: string[];
} {
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

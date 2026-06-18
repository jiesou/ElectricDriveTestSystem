import { assert, assertEquals, assertExists } from "@std/assert";

import { troubleTest } from "./core/TroubleTest.ts";
import { clientManager } from "./core/ClientManager.ts";
import { getSecondTimestamp } from "../utils/helpers.ts";
import { prisma } from "../prisma/client.ts";
import { app } from "../server.ts";

function mockSocket(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: (_data: string | ArrayBufferLike | Blob) => {},
    close: () => {},
  } as unknown as WebSocket;
}

async function req(path: string, init?: RequestInit): Promise<Response> {
  return await app.request(`http://localhost${path}`, init);
}

Deno.test("HTTP接口测试", async (t) => {
  await t.step("健康检查 /api/health：返回正常", async () => {
    const res = await req("/api/health");
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.status, "ok");
    assertEquals(typeof body.timestamp, "number");
  });

  await t.step("获取故障列表 /api/troubles：返回至少6个", async () => {
    const res = await req("/api/troubles");
    assertEquals(res.status, 200);
    const body = await res.json();
    assert(body.success);
    assert(body.data.length >= 6);
    assertEquals(typeof body.data[0].id, "number");
    assertEquals(typeof body.data[0].description, "string");
  });

  await t.step("获取题目列表 /api/questions：返回数组", async () => {
    const res = await req("/api/questions");
    assertEquals(res.status, 200);
    const body = await res.json();
    assert(body.success);
    assert(Array.isArray(body.data));
  });

  let createdQuestionId: number;
  await t.step(
    "创建题目 POST /api/questions：成功创建并返回新题目",
    async () => {
      const payload = {
        troubles: [{
          id: 100,
          description: "test fault",
          from_wire: 101,
          to_wire: 102,
        }],
      };
      const res = await req("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      assertEquals(res.status, 200);
      const body = await res.json();
      assert(body.success);
      assertExists(body.data.id);
      assertEquals(body.data.troubles.length, 1);
      assertEquals(body.data.troubles[0].description, "test fault");
      createdQuestionId = body.data.id;
    },
  );

  await t.step("更新题目 PUT /api/questions/:id：成功修改", async () => {
    const payload = {
      troubles: [{
        id: 200,
        description: "updated fault",
        from_wire: 201,
        to_wire: 202,
      }],
    };
    const res = await req(`/api/questions/${createdQuestionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    const q = troubleTest.questions.find((q) => q.id === createdQuestionId);
    assertExists(q);
    assertEquals(q!.troubles[0].description, "updated fault");
  });

  await t.step("删除题目 DELETE /api/questions/:id：成功移除", async () => {
    const res = await req(`/api/questions/${createdQuestionId}`, {
      method: "DELETE",
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    const q = troubleTest.questions.find((q) => q.id === createdQuestionId);
    assertEquals(q, undefined);
  });

  await t.step(
    "创建题目 POST：缺少参数时返回400",
    async () => {
      const res = await req("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assertEquals(res.status, 400);
      const body = await res.json();
      assertEquals(body.success, false);
    },
  );

  await t.step(
    "更新题目 PUT：不存在的ID返回404",
    async () => {
      const res = await req("/api/questions/99999", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          troubles: [{ id: 1, description: "x", from_wire: 1, to_wire: 2 }],
        }),
      });
      assertEquals(res.status, 404);
    },
  );

  await t.step(
    "删除题目 DELETE：不存在的ID返回404",
    async () => {
      const res = await req("/api/questions/99999", { method: "DELETE" });
      assertEquals(res.status, 404);
    },
  );

  await t.step("获取客户机列表 /api/clients：返回数组", async () => {
    const res = await req("/api/clients");
    assertEquals(res.status, 200);
    const body = await res.json();
    assert(body.success);
    assert(Array.isArray(body.data));
  });

  await t.step("修改客户机名称 PUT /api/clients/:id：成功", async () => {
    const socket = mockSocket();
    const client = clientManager.connectClient("10.0.0.200", socket);
    assertExists(clientManager.clients[client.id]);

    const res = await req(`/api/clients/${client.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "测试工位" }),
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(client.name, "测试工位");

    delete clientManager.clients[client.id];
    await prisma.storedClient.delete({ where: { id: client.id } }).catch(
      () => {},
    );
  });

  await t.step("忘记客户机 POST /api/clients/forget：清空所有", async () => {
    const socket = mockSocket();
    clientManager.connectClient("10.0.0.201", socket);
    assert(Object.keys(clientManager.clients).length > 0);

    const res = await req("/api/clients/forget", { method: "POST" });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(Object.keys(clientManager.clients).length, 0);
  });

  await t.step("获取测验列表 /api/tests：返回数组", async () => {
    const res = await req("/api/tests");
    assertEquals(res.status, 200);
    const body = await res.json();
    assert(body.success);
    assert(Array.isArray(body.data));
  });

  await t.step("创建测验会话 POST /api/tests/test-sessions：成功", async () => {
    const socket = mockSocket();
    const client = clientManager.connectClient("10.0.0.202", socket);
    const q = await troubleTest.addQuestion({
      troubles: [{
        id: 1,
        description: "session test fault",
        from_wire: 1,
        to_wire: 2,
      }],
    });

    const res = await req("/api/tests/test-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientIds: [client.id], questionIds: [q.id] }),
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assert(body.success);
    assertEquals(body.data.length, 1);
    assertEquals(body.data[0].clientId, client.id);
    assertExists(client.testSession);

    const testId = client.testSession!.test.id;
    await troubleTest.deleteQuestion(q.id);
    clientManager.clients = {};
    troubleTest.tests = [];
    await prisma.storedTest.delete({ where: { id: BigInt(testId) } }).catch(
      () => {},
    );
  });

  await t.step(
    "创建测验会话 POST：缺少参数时返回400",
    async () => {
      const res = await req("/api/tests/test-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assertEquals(res.status, 400);
    },
  );

  await t.step(
    "强制推送 POST /api/tests/push-latest：无请求体返回400",
    async () => {
      const res = await req("/api/tests/push-latest", { method: "POST" });
      assertEquals(res.status, 400);
    },
  );

  await t.step(
    "强制推送 POST：有会话的客户机能收到试题",
    async () => {
      const socket = mockSocket();
      const client = clientManager.connectClient("10.0.0.210", socket);
      client.testSession = {
        id: "push-test-1",
        test: {
          id: 500,
          questions: [{
            id: 1,
            troubles: [{
              id: 1,
              description: "push test",
              from_wire: 1,
              to_wire: 2,
            }],
          }],
          startTime: getSecondTimestamp(),
          durationTime: null,
        },
        logs: [],
      };

      const res = await req("/api/tests/push-latest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assertEquals(res.status, 200);
      const body = await res.json();
      assert(body.success);
      const myResult = body.data.results.find((r: any) =>
        r.clientId === client.id
      );
      assertExists(myResult);
      assertEquals(myResult.pushed, true);

      delete clientManager.clients[client.id];
    },
  );

  await t.step("强制推送 POST：无会话的客户机提示无测验会话", async () => {
    const socket = mockSocket();
    const client = clientManager.connectClient("10.0.0.211", socket);

    const res = await req("/api/tests/push-latest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assert(body.success);
    const myResult = body.data.results.find((r: any) =>
      r.clientId === client.id
    );
    assertExists(myResult);
    assertEquals(myResult.pushed, false);
    assertEquals(myResult.reason, "无测验会话");

    delete clientManager.clients[client.id];
  });

  await t.step(
    "强制推送 POST：指定客户机编号只推送给该客户机",
    async () => {
      const socket = mockSocket();
      const client1 = clientManager.connectClient("10.0.0.216", socket);
      clientManager.connectClient("10.0.0.217", mockSocket());
      client1.testSession = {
        id: "push-specific-1",
        test: {
          id: 550,
          questions: [{
            id: 1,
            troubles: [{
              id: 1,
              description: "specific",
              from_wire: 1,
              to_wire: 2,
            }],
          }],
          startTime: getSecondTimestamp(),
          durationTime: null,
        },
        logs: [],
      };

      const res = await req("/api/tests/push-latest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIds: [client1.id] }),
      });
      assertEquals(res.status, 200);
      const body = await res.json();
      assert(body.success);
      assertEquals(body.data.total, 1);
      assertEquals(body.data.results[0].clientId, client1.id);
      assertEquals(body.data.results[0].pushed, true);

      delete clientManager.clients[client1.id];
      delete clientManager
        .clients[
          Object.keys(clientManager.clients).find((k) => k !== client1.id)!
        ];
    },
  );

  await t.step(
    "强制推送 POST：不存在的客户机编号返回空结果",
    async () => {
      const res = await req("/api/tests/push-latest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIds: ["nonexistent-id"] }),
      });
      assertEquals(res.status, 200);
      const body = await res.json();
      assert(body.success);
      assertEquals(body.data.total, 0);
    },
  );

  await t.step(
    "创建测验会话 POST：不存在的客户机编号被跳过，data 包含该 ID 但无 client 被实际创建会话",
    async () => {
      const q = await troubleTest.addQuestion({
        troubles: [{
          id: 1,
          description: "non-existent test",
          from_wire: 1,
          to_wire: 2,
        }],
      });

      const res = await req("/api/tests/test-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIds: ["nonexistent-id"],
          questionIds: [q.id],
        }),
      });
      assertEquals(res.status, 200);
      const body = await res.json();
      assert(body.success);
      assertEquals(body.data.length, 1, "应有一条结果");
      assertEquals(body.data[0].clientId, "nonexistent-id");
      assertEquals(
        Object.values(clientManager.clients).filter((c) => c.testSession)
          .length,
        0,
        "应无实际 client 获得会话",
      );

      await troubleTest.deleteQuestion(q.id);
    },
  );

  await t.step(
    "结束所有测验 POST /api/tests/finish-all：全部完成",
    async () => {
      const socket = mockSocket();
      const client = clientManager.connectClient("10.0.0.212", socket);
      client.testSession = {
        id: "finish-all-1",
        test: {
          id: 600,
          questions: [{
            id: 1,
            troubles: [{
              id: 1,
              description: "finish all",
              from_wire: 1,
              to_wire: 2,
            }],
          }],
          startTime: getSecondTimestamp(),
          durationTime: null,
        },
        logs: [],
      };

      const res = await req("/api/tests/finish-all", { method: "POST" });
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.success, true);
      assertExists(client.testSession!.finishTime);

      delete clientManager.clients[client.id];
    },
  );

  await t.step(
    "清除所有测验 POST /api/tests/clear-all：会话清空",
    async () => {
      const socket = mockSocket();
      const client = clientManager.connectClient("10.0.0.213", socket);
      client.testSession = {
        id: "clear-all-1",
        test: {
          id: 700,
          questions: [{
            id: 1,
            troubles: [{
              id: 1,
              description: "clear",
              from_wire: 1,
              to_wire: 2,
            }],
          }],
          startTime: getSecondTimestamp(),
          durationTime: null,
        },
        logs: [],
      };

      const res = await req("/api/tests/clear-all", { method: "POST" });
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.success, true);
      assertEquals(client.testSession, undefined);
    },
  );

  await t.step(
    "彩虹桥 POST /api/tests/relay-rainbow：无客户机时发送0",
    async () => {
      const savedClients = clientManager.clients;
      clientManager.clients = {};

      try {
        const res = await req("/api/tests/relay-rainbow", { method: "POST" });
        assertEquals(res.status, 200);
        const body = await res.json();
        assertEquals(body.success, true);
        assertEquals(body.data.sent, 0);
        assertEquals(body.data.latencies.length, 0);
      } finally {
        clientManager.clients = savedClients;
      }
    },
  );

  await t.step(
    "修改客户机 PUT：不存在的ID返回404",
    async () => {
      const res = await req("/api/clients/nonexistent-id", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test" }),
      });
      assertEquals(res.status, 404);
    },
  );

  await t.step("修改客户机 PUT：名称为空返回400", async () => {
    const socket = mockSocket();
    const client = clientManager.connectClient("10.0.0.214", socket);

    const res = await req(`/api/clients/${client.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    assertEquals(res.status, 400);

    delete clientManager.clients[client.id];
  });

  await t.step(
    "修改客户机 PUT：名称不是字符串返回400",
    async () => {
      const socket = mockSocket();
      const client = clientManager.connectClient("10.0.0.215", socket);

      const res = await req(`/api/clients/${client.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: 123 }),
      });
      assertEquals(res.status, 400);

      delete clientManager.clients[client.id];
    },
  );

  await t.step(
    "修改客户机 PUT：请求体不是合法JSON返回400",
    async () => {
      const res = await req("/api/clients/some-id", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{invalid json}",
      });
      assertEquals(res.status, 400);
    },
  );
});

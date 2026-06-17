import { assert, assertEquals, assertExists } from "@std/assert";

import { troubleTest } from "./TroubleTest.ts";
import { clientManager } from "./ClientManager.ts";
import { getSecondTimestamp } from "./types.ts";
import { prisma } from "./prisma/client.ts";
import { app } from "./server.ts";

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

Deno.test("HTTP API endpoints", async (t) => {
  await t.step("GET /health returns 200 with status ok", async () => {
    const res = await req("/health");
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.status, "ok");
    assertEquals(typeof body.ts, "number");
  });

  await t.step("GET /api/troubles returns trouble list", async () => {
    const res = await req("/api/troubles");
    assertEquals(res.status, 200);
    const body = await res.json();
    assert(body.success);
    assert(body.data.length >= 6);
    assertEquals(typeof body.data[0].id, "number");
    assertEquals(typeof body.data[0].description, "string");
  });

  await t.step("GET /api/questions returns list", async () => {
    const res = await req("/api/questions");
    assertEquals(res.status, 200);
    const body = await res.json();
    assert(body.success);
    assert(Array.isArray(body.data));
  });

  let createdQuestionId: number;
  await t.step("POST /api/questions creates new question", async () => {
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
  });

  await t.step("PUT /api/questions/:id updates existing question", async () => {
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

  await t.step("DELETE /api/questions/:id removes question", async () => {
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
    "POST /api/questions with invalid body returns 400",
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
    "PUT /api/questions/:id with non-existent id returns 404",
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
    "DELETE /api/questions/:id with non-existent id returns 404",
    async () => {
      const res = await req("/api/questions/99999", { method: "DELETE" });
      assertEquals(res.status, 404);
    },
  );

  await t.step("GET /api/clients returns list", async () => {
    const res = await req("/api/clients");
    assertEquals(res.status, 200);
    const body = await res.json();
    assert(body.success);
    assert(Array.isArray(body.data));
  });

  await t.step("PUT /api/clients/:id updates client name", async () => {
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

  await t.step("POST /api/clients/forget clears clients", async () => {
    const socket = mockSocket();
    clientManager.connectClient("10.0.0.201", socket);
    assert(Object.keys(clientManager.clients).length > 0);

    const res = await req("/api/clients/forget", { method: "POST" });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(Object.keys(clientManager.clients).length, 0);
  });

  await t.step("GET /api/tests returns list", async () => {
    const res = await req("/api/tests");
    assertEquals(res.status, 200);
    const body = await res.json();
    assert(body.success);
    assert(Array.isArray(body.data));
  });

  await t.step("POST /api/tests/test-sessions creates sessions", async () => {
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
    "POST /api/tests/test-sessions with invalid body returns 400",
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
    "POST /api/tests/push-latest with no body returns 400",
    async () => {
      const res = await req("/api/tests/push-latest", { method: "POST" });
      assertEquals(res.status, 400);
    },
  );

  await t.step(
    "POST /api/tests/push-latest pushes to client with session",
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

  await t.step("POST /api/tests/push-latest reports no session", async () => {
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
    "POST /api/tests/finish-all finishes active sessions",
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
    "POST /api/tests/clear-all clears sessions and tests",
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
    "POST /api/tests/relay-rainbow with no clients returns sent 0",
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
    "PUT /api/clients/:id with non-existent id returns 404",
    async () => {
      const res = await req("/api/clients/nonexistent-id", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test" }),
      });
      assertEquals(res.status, 404);
    },
  );

  await t.step("PUT /api/clients/:id with empty name returns 400", async () => {
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
    "PUT /api/clients/:id with non-string name returns 400",
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
    "PUT /api/clients/:id with invalid body returns 400",
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

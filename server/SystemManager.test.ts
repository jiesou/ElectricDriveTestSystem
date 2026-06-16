import { assertEquals, assert } from "@std/assert";
import { join } from "@std/path";

// 构造测试用客户机数据
function makeClient(id: string, ip: string, extra: Record<string, unknown> = {}) {
  return { id, name: ip, ip, online: true, socket: {} as WebSocket, lastPing: 1234567890, ...extra };
}

// 构造测试用 CV 客户机数据
function makeCvClient(ip: string, extra: Record<string, unknown> = {}) {
  return {
    clientType: "jetson_nano" as const,
    ip,
    xiaoxin_status: { type: "status_text_update" as const, status_text: "分析中" },
    ...extra,
  };
}

// 模拟 SystemManager 存储变换：移除 socket 和 xiaoxin_status
function applySaveTransform(clients: Record<string, unknown>) {
  return {
    clients: Object.fromEntries(
      Object.entries(clients).map(([id, client]) => [
        id,
        {
          ...(client as Record<string, unknown>),
          socket: undefined,
          cvClient: (client as any).cvClient
            ? { ...(client as any).cvClient, xiaoxin_status: undefined }
            : undefined,
        },
      ]),
    ),
  };
}

// 模拟 SystemManager 恢复逻辑：强制离线 + 重建 cvClients 共享引用
function applyRestore(data: { clients?: Record<string, unknown> }) {
  const clients: Record<string, any> = {};
  const cvClients: Record<string, any> = {};

  if (!data.clients) return { clients, cvClients };

  for (const [id, raw] of Object.entries(data.clients)) {
    const c = raw as Record<string, unknown>;
    if (!c || typeof c !== "object") continue;
    clients[id] = { ...c, online: false, socket: undefined };
  }

  for (const client of Object.values(clients)) {
    if (client.cvClient) {
      const cvIp = client.cvClient.ip;
      if (!cvClients[cvIp]) cvClients[cvIp] = client.cvClient;
      client.cvClient = cvClients[cvIp];
    }
  }

  return { clients, cvClients };
}

// 写入临时 JSON 文件并读回
function writeReadJson(dir: string, data: unknown) {
  const file = join(dir, "data.json");
  Deno.writeTextFileSync(file, JSON.stringify(data));
  return JSON.parse(Deno.readTextFileSync(file));
}

Deno.test("1. 客户机状态序列化与反序列化——完整字段", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const saved = applySaveTransform({
      "c1": makeClient("c1", "192.168.1.1", {
        testSession: {
          id: "s1",
          test: { id: 1, questions: [], startTime: 100, durationTime: null },
          logs: [{ timestamp: 200, action: "start", details: {} }],
        },
        evaluateBoard: {
          description: "功能评估",
          function_steps: [
            { description: "步骤1", can_wait_for_ms: 1000, waited_for_ms: 500, passed: true, finished: true },
          ],
        },
        cvClient: makeCvClient("10.0.0.1"),
      }),
      "c2": makeClient("c2", "192.168.1.2"),
    });

    const loaded = writeReadJson(tmpDir, saved);
    const { clients } = applyRestore(loaded);

    assertEquals(clients["c1"].name, "192.168.1.1");
    assertEquals(clients["c1"].testSession.id, "s1");
    assertEquals(clients["c1"].testSession.test.id, 1);
    assertEquals(clients["c1"].evaluateBoard.description, "功能评估");
    assertEquals(clients["c1"].cvClient.ip, "10.0.0.1");
    assertEquals(clients["c1"].cvClient.clientType, "jetson_nano");
    assertEquals(clients["c2"].name, "192.168.1.2");
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("2. 相同 cvClientIp 的客户机恢复后共享同一 cvClient 引用", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const saved = applySaveTransform({
      "c1": makeClient("c1", "192.168.1.1", { cvClient: makeCvClient("10.0.0.1") }),
      "c2": makeClient("c2", "192.168.1.2", { cvClient: makeCvClient("10.0.0.1") }),
    });

    const loaded = writeReadJson(tmpDir, saved);
    const { clients } = applyRestore(loaded);

    assert(clients["c1"].cvClient === clients["c2"].cvClient);
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("3. 恢复后所有客户机 online=false", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const saved = applySaveTransform({
      "c1": makeClient("c1", "192.168.1.1"),
      "c2": makeClient("c2", "192.168.1.2"),
    });

    const loaded = writeReadJson(tmpDir, saved);
    const { clients } = applyRestore(loaded);

    for (const client of Object.values(clients)) {
      assertEquals(client.online, false);
    }
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("4. socket 在持久化前被移除", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const saved = applySaveTransform({
      "c1": makeClient("c1", "192.168.1.1"),
    });

    const loaded = writeReadJson(tmpDir, saved);
    const clientData = loaded.clients["c1"];

    assertEquals(clientData.socket, undefined);
    assertEquals("socket" in clientData, false);
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

Deno.test("5. xiaoxin_status 在持久化前被移除", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const saved = applySaveTransform({
      "c1": makeClient("c1", "192.168.1.1", { cvClient: makeCvClient("10.0.0.1") }),
    });

    const loaded = writeReadJson(tmpDir, saved);
    const cvClient = loaded.clients["c1"].cvClient;

    assertEquals(cvClient.xiaoxin_status, undefined);
    assertEquals("xiaoxin_status" in cvClient, false);
  } finally {
    Deno.removeSync(tmpDir, { recursive: true });
  }
});

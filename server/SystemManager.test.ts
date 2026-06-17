import { assertEquals, assert } from "@std/assert";
import { ClientManager } from "./ClientManager.ts";
import { prisma } from "./prisma/client.ts";

function makeClient(ip: string, extra: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    name: ip,
    ip,
    online: true,
    socket: { readyState: WebSocket.OPEN, send: () => {} } as unknown as WebSocket,
    lastPing: 1234567890,
    ...extra,
  };
}

Deno.test("数据持久化 - 保存客户端：socket 被移除，testSession 被转成 JSON", async () => {
  const mgr = new ClientManager();
  const capturedArgs: any[] = [];
  const origUpsert = prisma.storedClient.upsert.bind(prisma.storedClient);

  try {
    (prisma.storedClient as any).upsert = async (args: any) => {
      capturedArgs.push(args);
      return args.create;
    };

    const client = mgr.connectClient("10.0.0.1", makeFakeSocket());
    client.testSession = {
      id: "s1",
      test: { id: 1, questions: [], startTime: 100, durationTime: null },
      logs: [],
    };

    await mgr.persistClient(client);

    assertEquals(capturedArgs.length, 1);
    const saved = capturedArgs[0];
    assertEquals(saved.create.id, client.id);
    assertEquals(saved.create.ip, "10.0.0.1");
    assert(!("socket" in saved.create));
    assertEquals(typeof saved.create.testSessionJson, "string");
    const parsedSession = JSON.parse(saved.create.testSessionJson);
    assertEquals(parsedSession.id, "s1");
  } finally {
    (prisma.storedClient as any).upsert = origUpsert;
  }
});

Deno.test("数据持久化 - 保存客户端：xiaoxin_status 不会被保存", async () => {
  const mgr = new ClientManager();
  const capturedArgs: any[] = [];
  const origUpsert = prisma.storedClient.upsert.bind(prisma.storedClient);
  const origCvUpsert = prisma.storedCvClient.upsert.bind(prisma.storedCvClient);

  try {
    (prisma.storedClient as any).upsert = async (args: any) => {
      capturedArgs.push(args);
      return args.create;
    };
    (prisma.storedCvClient as any).upsert = async (args: any) => {
      return args.create;
    };

    const client = mgr.connectClient("10.0.0.2", makeFakeSocket());
    client.cvClient = { clientType: "jetson_nano" as const, ip: "10.0.0.100" };
    client.cvClient.xiaoxin_status = { type: "status_text_update", status_text: "分析中" };

    await mgr.persistClient(client);

    const savedClient = capturedArgs[0];
    assertEquals(savedClient.create.cvClientIp, "10.0.0.100");
  } finally {
    (prisma.storedClient as any).upsert = origUpsert;
    (prisma.storedCvClient as any).upsert = origCvUpsert;
  }
});

Deno.test("数据持久化 - 恢复客户端：相同 cvClientIp 的客户机共享同一个引用", async () => {
  const mgr = new ClientManager();
  const origFindMany = prisma.storedClient.findMany.bind(prisma.storedClient);
  const origCvFindMany = prisma.storedCvClient.findMany.bind(prisma.storedCvClient);

  try {
    (prisma.storedClient as any).findMany = async () => [
      { id: "c1", name: "c1", ip: "10.0.0.1", cvClientIp: "10.0.0.100", testSessionJson: null, evaluateBoardJson: null },
      { id: "c2", name: "c2", ip: "10.0.0.2", cvClientIp: "10.0.0.100", testSessionJson: null, evaluateBoardJson: null },
    ];
    (prisma.storedCvClient as any).findMany = async () => [
      { ip: "10.0.0.100", clientType: "jetson_nano", sessionJson: null },
    ];

    await mgr.loadAllClients();

    assert(mgr.clients["c1"].cvClient === mgr.clients["c2"].cvClient);
    assertEquals(mgr.clients["c1"].online, false);
    assertEquals(mgr.cvClients["10.0.0.100"].clientType, "jetson_nano");
  } finally {
    (prisma.storedClient as any).findMany = origFindMany;
    (prisma.storedCvClient as any).findMany = origCvFindMany;
    mgr.clients = {};
    mgr.cvClients = {};
  }
});

Deno.test("数据持久化 - 恢复后所有客户机默认离线状态", async () => {
  const mgr = new ClientManager();
  const origFindMany = prisma.storedClient.findMany.bind(prisma.storedClient);
  const origCvFindMany = prisma.storedCvClient.findMany.bind(prisma.storedCvClient);

  try {
    (prisma.storedClient as any).findMany = async () => [
      { id: "c1", name: "c1", ip: "10.0.0.1", cvClientIp: null, testSessionJson: null, evaluateBoardJson: null },
      { id: "c2", name: "c2", ip: "10.0.0.2", cvClientIp: null, testSessionJson: null, evaluateBoardJson: null },
    ];
    (prisma.storedCvClient as any).findMany = async () => [];

    await mgr.loadAllClients();

    for (const client of Object.values(mgr.clients)) {
      assertEquals(client.online, false);
    }
  } finally {
    (prisma.storedClient as any).findMany = origFindMany;
    (prisma.storedCvClient as any).findMany = origCvFindMany;
    mgr.clients = {};
    mgr.cvClients = {};
  }
});

Deno.test("数据持久化 - 恢复客户端的测验会话和功能评估板", async () => {
  const mgr = new ClientManager();
  const origFindMany = prisma.storedClient.findMany.bind(prisma.storedClient);
  const origCvFindMany = prisma.storedCvClient.findMany.bind(prisma.storedCvClient);

  try {
    (prisma.storedClient as any).findMany = async () => [
      {
        id: "c1", name: "c1", ip: "10.0.0.1", cvClientIp: null,
        testSessionJson: JSON.stringify({
          id: "s1", test: { id: 1, questions: [], startTime: 100, durationTime: null }, logs: [],
        }),
        evaluateBoardJson: JSON.stringify({
          description: "功能评估",
          function_steps: [{ description: "步骤1", can_wait_for_ms: 1000, waited_for_ms: 500, passed: true, finished: true }],
        }),
      },
    ];
    (prisma.storedCvClient as any).findMany = async () => [];

    await mgr.loadAllClients();

    assertEquals(mgr.clients["c1"].testSession!.id, "s1");
    assertEquals(mgr.clients["c1"].evaluateBoard!.description, "功能评估");
  } finally {
    (prisma.storedClient as any).findMany = origFindMany;
    (prisma.storedCvClient as any).findMany = origCvFindMany;
    mgr.clients = {};
    mgr.cvClients = {};
  }
});

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

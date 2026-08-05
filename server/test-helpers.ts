import { prisma } from "./prisma/client.ts";

/**
 * 测试数据库清理辅助：在文件加载时快照数据库四张表的现有数据，
 * 在 Deno.test.afterAll 中把表恢复回快照状态，删除测试运行期间写入的残留行。
 *
 * 用法：在测试文件顶部调用 snapshotDatabaseState() 即可。
 * 注意：Deno 测试文件之间是串行运行的，快照/恢复在同一文件内完成，互不干扰。
 */

async function snapshotStoredClients() {
  return await prisma.storedClient.findMany();
}
async function snapshotStoredCvClients() {
  return await prisma.storedCvClient.findMany();
}
async function snapshotStoredQuestions() {
  return await prisma.storedQuestion.findMany();
}
async function snapshotStoredTests() {
  return await prisma.storedTest.findMany();
}

async function takeSnapshot() {
  return {
    clients: await snapshotStoredClients(),
    cvClients: await snapshotStoredCvClients(),
    questions: await snapshotStoredQuestions(),
    tests: await snapshotStoredTests(),
  };
}

async function restoreSnapshot(
  snapshot: Awaited<ReturnType<typeof takeSnapshot>>,
): Promise<void> {
  // 删除快照中不存在的行
  const clientIds = snapshot.clients.map((c) => c.id);
  await prisma.storedClient.deleteMany({
    where: { id: { notIn: clientIds.length > 0 ? clientIds : ["__none__"] } },
  });

  const cvIps = snapshot.cvClients.map((c) => c.ip);
  await prisma.storedCvClient.deleteMany({
    where: { ip: { notIn: cvIps.length > 0 ? cvIps : ["__none__"] } },
  });

  const questionIds = snapshot.questions.map((q) => q.id);
  await prisma.storedQuestion.deleteMany({
    where: { id: { notIn: questionIds.length > 0 ? questionIds : [-1] } },
  });

  const testIds = snapshot.tests.map((t) => t.id);
  await prisma.storedTest.deleteMany({
    where: { id: { notIn: testIds.length > 0 ? testIds : [BigInt(-1)] } },
  });
}

export function snapshotDatabaseState(): void {
  const snapshotPromise = takeSnapshot();

  Deno.test.afterAll(async () => {
    const snapshot = await snapshotPromise;
    await restoreSnapshot(snapshot);
  });
}

/**
 * 模拟"服务器重启"：清空内存态，从数据库重新加载。
 * 用于持久化测试：断言"通过真实业务路径产生的状态，重启后依然存在"。
 */
export async function restartServer(): Promise<void> {
  const { clientManager } = await import("./routes/core/ClientManager.ts");
  const { troubleTest } = await import("./routes/core/TroubleTest.ts");
  clientManager.clients = {};
  clientManager.cvClients = {};
  await clientManager.loadAllClients();
  await troubleTest.init();
}

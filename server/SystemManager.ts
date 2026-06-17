import { prisma } from "./prisma/client.ts";
import { clientManager } from "./ClientManager.ts";

// 系统初始化：从数据库恢复所有客户端状态（包括 cvClient 绑定）
export async function initSystem() {
  await clientManager.loadAllClients();
  console.log(`[System] Loaded ${Object.keys(clientManager.clients).length} clients from database`);
}

// 将客户端状态持久化到数据库（含独立 CvClient 表）
export async function persistClient(client: import("./types.ts").Client) {
  // 先持久化 CV 客户端，满足外键依赖
  if (client.cvClient) {
    await prisma.storedCvClient.upsert({
      where: { ip: client.cvClient.ip },
      update: {
        clientType: client.cvClient.clientType,
        sessionJson: client.cvClient.session ? JSON.stringify(client.cvClient.session) : null,
      },
      create: {
        ip: client.cvClient.ip,
        clientType: client.cvClient.clientType,
        sessionJson: client.cvClient.session ? JSON.stringify(client.cvClient.session) : null,
      },
    });
  }

  await prisma.storedClient.upsert({
    where: { id: client.id },
    update: {
      name: client.name,
      ip: client.ip,
      cvClientIp: client.cvClient?.ip || null,
      testSessionJson: client.testSession ? JSON.stringify(client.testSession) : null,
      evaluateBoardJson: client.evaluateBoard ? JSON.stringify(client.evaluateBoard) : null,
    },
    create: {
      id: client.id,
      name: client.name,
      ip: client.ip,
      cvClientIp: client.cvClient?.ip || null,
      testSessionJson: client.testSession ? JSON.stringify(client.testSession) : null,
      evaluateBoardJson: client.evaluateBoard ? JSON.stringify(client.evaluateBoard) : null,
    },
  });
}

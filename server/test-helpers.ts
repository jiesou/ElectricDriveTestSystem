/**
 * 测试辅助：模拟"服务器重启"。
 * 清空内存态，从数据库重新加载，用于断言"通过真实业务路径产生的状态，重启后依然存在"。
 *
 * 注意：测试运行在独立副本库（NODE_ENV=test 时自动从生产库复制），不会污染生产数据。
 */
export async function restartServer(): Promise<void> {
  const { clientManager } = await import("./routes/core/ClientManager.ts");
  const { troubleTest } = await import("./routes/core/TroubleTest.ts");
  clientManager.clients = {};
  clientManager.cvClients = {};
  await clientManager.loadAllClients();
  await troubleTest.init();
}

import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { join, isAbsolute } from "@std/path";

// 数据库文件路径由环境变量显式传入，生产与测试各写各的 env 文件。
// 相对路径统一基于 server/ 目录解析，保证无论 cwd 是终端还是 VSCode LSP 都指向同一份库。
const serverRoot = join(import.meta.dirname!, "..");

function resolveDbUrl(url: string | undefined): string {
  if (!url) return url!;
  const filePath = url.replace(/^file:/, "");
  const resolved = isAbsolute(filePath)
    ? filePath
    : join(serverRoot, filePath);
  return `file:${resolved}`;
}

const dbUrl = resolveDbUrl(Deno.env.get("DATABASE_URL"));
if (!dbUrl) {
  throw new Error(
    "缺少 DATABASE_URL 环境变量，例如 file:data/data.db（生产）或 file:data/data.test.db（测试）",
  );
}

/**
 * 复制数据库快照：VACUUM INTO 会先把 WAL 里未落盘的数据合并进主文件，
 * 产出一份完整自包含的副本，比直接 copyFile 更可靠。
 */
async function copyDbSnapshot(srcUrl: string, dstUrl: string): Promise<void> {
  const copy = new PrismaClient({
    adapter: new PrismaLibSql({ url: srcUrl }),
  });
  try {
    await copy.$executeRawUnsafe(`VACUUM INTO '${dstUrl}'`);
  } finally {
    await copy.$disconnect();
  }
}

// NODE_ENV=test 下
// 每次从生产库复制最新快照：先复制到带 PID 的临时文件再原子替换
// 多个测试文件（独立进程）并发启动也不会互相破坏
if (Deno.env.get("NODE_ENV") === "test") {
  const prodUrl = resolveDbUrl(Deno.env.get("DATABASE_URL_PROD"));
  const dbPath = dbUrl.replace(/^file:/, "");
  const tmpPath = `${dbPath}.${Deno.pid}.tmp`;
  await copyDbSnapshot(prodUrl!, tmpPath);
  await Deno.rename(tmpPath, dbPath).catch(async () => {
    await Deno.remove(dbPath).catch(() => {});
    await Deno.rename(tmpPath, dbPath);
  });
  console.log(`[Prisma] 测试副本已就绪: ${dbUrl}`);
}

const adapter = new PrismaLibSql({ url: dbUrl });
export const prisma = new PrismaClient({ adapter });

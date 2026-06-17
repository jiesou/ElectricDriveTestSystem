import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { join } from "@std/path";

const dbPath = join(import.meta.dirname!, "..", "data", "data.db");
const adapter = new PrismaLibSql({ url: `file:${dbPath}` });
export const prisma = new PrismaClient({ adapter });

try {
  await prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL");
  console.log("[Prisma] SQLite WAL mode enabled");
} catch {
  // WAL pragma might fail if already set or on some systems
}

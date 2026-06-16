import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({ url: "file:./data/data.db" });
export const prisma = new PrismaClient({ adapter });

try {
  await prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL");
  console.log("[Prisma] SQLite WAL mode enabled");
} catch {
  // WAL pragma might fail if already set or on some systems
}

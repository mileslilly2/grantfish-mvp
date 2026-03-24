import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

let prismaInstance: PrismaClient | undefined;

export async function getPrisma() {
  if (!prismaInstance) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }

    const adapter = new PrismaPg({ connectionString });
    prismaInstance = new PrismaClient({ adapter });
  }

  return prismaInstance;
}
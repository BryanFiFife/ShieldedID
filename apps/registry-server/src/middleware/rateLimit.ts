import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";

export async function registerRateLimit(app: FastifyInstance) {
  await app.register(rateLimit, {
    global: false,
    max: 1000,
    timeWindow: "1 minute"
  });
}

export const registrationRateLimit = {
  max: 10,
  timeWindow: "1 minute"
};

const walletLimitWindowMs = 60_000;
const walletLimitMax = 5;
const walletRequestBuckets = new Map<string, number[]>();

export function assertWalletRateLimit(walletId: string) {
  const now = Date.now();
  const bucket = walletRequestBuckets.get(walletId) ?? [];
  const recent = bucket.filter((timestamp) => now - timestamp < walletLimitWindowMs);
  if (recent.length >= walletLimitMax) {
    throw new Error("RATE_LIMITED");
  }
  recent.push(now);
  walletRequestBuckets.set(walletId, recent);
}

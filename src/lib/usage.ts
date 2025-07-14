import { auth } from "@clerk/nextjs/server";
import { RateLimiterPrisma } from "rate-limiter-flexible";

import { prisma } from "@/lib/db";
import { z } from "zod";

type ClerkHasFunction = Awaited<ReturnType<typeof auth>>["has"];

const userIdSchema = z.string().min(1, "User ID must be a non-empty string");

export const GENERATION_COST = 1;
export const FREE_POINTS = 2;
export const PRO_POINTS = 100;
const DURATION = 30 * 24 * 60 * 60; // 30 days

export async function getUsageTracker(userId: string, has: ClerkHasFunction) {
  const validatedUserId = userIdSchema.parse(userId);

  const hasProAccess = has({ plan: "pro" });

  const usageTracker = new RateLimiterPrisma({
    storeClient: prisma,
    tableName: "Usage",
    points: hasProAccess ? PRO_POINTS : FREE_POINTS,
    duration: DURATION,
  });

  return usageTracker.get(validatedUserId);
}

export async function consumeCredits(userId: string, effectivePoints: number) {
  const validatedUserId = userIdSchema.parse(userId);

  const limiter = new RateLimiterPrisma({
    storeClient: prisma,
    tableName: "Usage",
    points: effectivePoints,
    duration: DURATION,
  });

  const consumptionResult = await limiter.consume(
    validatedUserId,
    GENERATION_COST
  );
  return consumptionResult;
}

import { getUsageTracker } from "@/lib/usage";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { auth } from "@clerk/nextjs/server";
import { TRPCError } from "@trpc/server";

export const usageRouter = createTRPCRouter({
  status: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.auth.userId;
    const { has } = await auth();

    if (!userId || !has) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication context missing",
      });
    }

    try {
      const result = await getUsageTracker(ctx.auth.userId, has);

      return result;
    } catch (error) {
      console.error(error);
      return null;
    }
  }),
});

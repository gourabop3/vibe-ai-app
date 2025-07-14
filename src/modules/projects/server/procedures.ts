import { z } from "zod";
import { generateSlug } from "random-word-slugs";

import { prisma } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";
import {
  FREE_POINTS,
  GENERATION_COST,
  getUsageTracker,
  PRO_POINTS,
} from "@/lib/usage";
import { auth } from "@clerk/nextjs/server";

export const projectsRouter = createTRPCRouter({
  getOne: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .query(async ({ input, ctx }) => {
      const existingProject = await prisma.project.findUnique({
        where: {
          id: input.id,
          userId: ctx.auth.userId,
        },
      });

      if (!existingProject) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      return existingProject;
    }),
  getMany: protectedProcedure.query(async ({ ctx }) => {
    const projects = await prisma.project.findMany({
      where: {
        userId: ctx.auth.userId,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return projects;
  }),
  create: protectedProcedure
    .input(
      z.object({
        prompt: z
          .string()
          .min(1, { message: "Prompt is required" })
          .max(10000, {
            message: "Prompt is too long",
          }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.auth.userId;
      const { has } = await auth();

      if (!userId || !has) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Authentication context missing",
        });
      }

      const userTracker = await getUsageTracker(userId, has);

      if (
        userTracker !== null &&
        userTracker.remainingPoints < GENERATION_COST
      ) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "You don't have enough credits",
        });
      }

      const createdProject = await prisma.project.create({
        data: {
          userId: ctx.auth.userId,
          name: generateSlug(2, {
            format: "kebab",
          }),
          messages: {
            create: {
              content: input.prompt,
              role: "USER",
              type: "RESULT",
            },
          },
        },
      });

      const hasProAccess = has({ plan: "pro" });
      const effectivePoints = hasProAccess ? PRO_POINTS : FREE_POINTS;

      await inngest.send({
        name: "code-agent/run",
        data: {
          value: input.prompt,
          projectId: createdProject.id,
          userId: ctx.auth.userId,
          effectivePoints,
        },
      });

      return createdProject;
    }),
  deleteOne: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const projectToDelete = await prisma.project.findUnique({
        where: {
          id: input.id,
          userId: ctx.auth.userId,
        },
      });

      if (!projectToDelete) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      const deletedProject = await prisma.project.delete({
        where: {
          id: projectToDelete.id,
        },
      });

      return deletedProject;
    }),
});

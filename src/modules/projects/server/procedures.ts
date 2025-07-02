import { z } from "zod";
import { generateSlug } from "random-word-slugs";

import { prisma } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { TRPCError } from "@trpc/server";
import { baseProcedure, createTRPCRouter } from "@/trpc/init";

export const projectsRouter = createTRPCRouter({
  getOne: baseProcedure
    .input(
      z.object({
        id: z.string().uuid().min(1, { message: "ID is required" }),
      })
    )
    .query(async ({ input }) => {
      const existingProject = await prisma.project.findUnique({
        where: {
          id: input.id,
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
  getMany: baseProcedure.query(async () => {
    const projects = await prisma.project.findMany({
      orderBy: {
        updatedAt: "desc",
      },
    });

    return projects;
  }),
  create: baseProcedure
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
    .mutation(async ({ input }) => {
      try {
        const createdProject = await prisma.project.create({
          data: {
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

        await inngest.send({
          name: "code-agent/run",
          data: {
            value: input.prompt,
            projectId: createdProject.id,
          },
        });

        return createdProject;
      } catch (error) {
        console.error(error);
      }
    }),
});

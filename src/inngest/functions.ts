import { z } from "zod";

import { Sandbox } from "@e2b/code-interpreter";
import { channel, topic } from "@inngest/realtime";
import {
  openai,
  createAgent,
  createTool,
  createNetwork,
  type Tool,
  type Message,
  createState,
} from "@inngest/agent-kit";

import { FRAGMENT_TITLE_PROMPT, PROMPT, RESPONSE_PROMPT } from "@/prompt";
import { prisma } from "@/lib/db";

import { inngest } from "./client";
import {
  getSandbox,
  lastAssistantTextMessageContent,
  parseAgentOutput,
} from "./utils";
import { SANDBOX_TIMEOUT } from "./types";
import { consumeCredits } from "@/lib/usage";
import { Prisma } from "@/generated/prisma";

interface AgentState {
  summary: string;
  files: { [path: string]: string };
}

export const fragmentChannel = channel((userId: string) => `user:${userId}`)
  .addTopic(
    topic("fragment").schema(
      z.object({
        projectId: z.string(),
        status: z.literal("completed"),
        message: z.string(),
        fragmentId: z.string().uuid().optional(),
        messageId: z.string().uuid(),
        sandboxUrl: z.string().url().optional(),
        title: z.string().optional(),
        timestamp: z.date(),
      })
    )
  )
  .addTopic(
    topic("error").schema(
      z.object({
        projectId: z.string().uuid(),
        status: z.literal("error"),
        message: z.string(),
        timestamp: z.date(),
      })
    )
  );

export const codeAgentFunction = inngest.createFunction(
  { id: "code-agent" },
  { event: "code-agent/run" },
  async ({ event, step, publish }) => {
    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await Sandbox.create("vibe-ai-app-nextjs-v3");
      await sandbox.setTimeout(SANDBOX_TIMEOUT);
      return sandbox.sandboxId;
    });

    const previousMessages = await step.run(
      "get-previous-messages",
      async () => {
        const formattedMessages: Message[] = [];

        const messages = await prisma.message.findMany({
          where: {
            projectId: event.data.projectId,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 5,
        });

        for (const message of messages) {
          formattedMessages.push({
            type: "text",
            role: message.role === "ASSISTANT" ? "assistant" : "user",
            content: message.content,
          });
        }

        return formattedMessages.reverse();
      }
    );

    const state = createState<AgentState>(
      {
        summary: "",
        files: {},
      },
      {
        messages: previousMessages,
      }
    );

    const codeAgent = createAgent<AgentState>({
      name: "code-agent",
      description: "An expert coding agent",
      system: PROMPT,
      model: openai({
        model: "gpt-4.1",
        defaultParameters: {
          temperature: 0.1,
        },
      }),
      tools: [
        createTool({
          name: "terminal",
          description: "Use the terminal to run commands",
          parameters: z.object({
            command: z.string(),
          }),
          handler: async ({ command }, { step }) => {
            return await step?.run("terminal", async () => {
              const buffers = { stdout: "", stderr: "" };

              try {
                const sandbox = await getSandbox(sandboxId);
                const result = await sandbox.commands.run(command, {
                  onStdout: (data: string) => {
                    buffers.stdout += data;
                  },
                  onStderr: (data: string) => {
                    buffers.stderr += data;
                  },
                });

                return result.stdout;
              } catch (error) {
                console.error(
                  `Command failed: ${error} \nstdout: ${buffers.stdout}\nsterr: ${buffers.stderr}`
                );
                return `Command failed: ${error} \nstdout: ${buffers.stdout}\nsterr: ${buffers.stderr}`;
              }
            });
          },
        }),
        createTool({
          name: "createOrUpdateFiles",
          description: "Create or update files in the sandbox",
          parameters: z.object({
            files: z.array(
              z.object({
                path: z.string(),
                content: z.string(),
              })
            ),
          }),
          handler: async (
            { files },
            { step, network }: Tool.Options<AgentState>
          ) => {
            const newFiles = await step?.run(
              "createOrUpdateFiles",
              async () => {
                try {
                  const updatedFiles = network.state.data.files || {};
                  const sandbox = await getSandbox(sandboxId);
                  for (const file of files) {
                    await sandbox.files.write(file.path, file.content);
                    updatedFiles[file.path] = file.content;
                  }

                  return updatedFiles;
                } catch (error) {
                  return "Error: " + error;
                }
              }
            );

            if (typeof newFiles === "object") {
              network.state.data.files = newFiles;
            }
          },
        }),
        createTool({
          name: "readFiles",
          description: "Read files from the sandbox",
          parameters: z.object({
            files: z.array(z.string()),
          }),
          handler: async ({ files }, { step }) => {
            return await step?.run("readFiles", async () => {
              try {
                const sandbox = await getSandbox(sandboxId);
                const contents = [];

                for (const file of files) {
                  const content = await sandbox.files.read(file);
                  contents.push({ path: file, content });
                }

                return JSON.stringify(contents);
              } catch (error) {
                return "Error: " + error;
              }
            });
          },
        }),
      ],

      lifecycle: {
        onResponse: async ({ result, network }) => {
          const lastAssistantTextMessage =
            lastAssistantTextMessageContent(result);

          if (lastAssistantTextMessage && network) {
            if (lastAssistantTextMessage.includes("<task_summary>")) {
              network.state.data.summary = lastAssistantTextMessage;
            }
          }

          return result;
        },
      },
    });

    const network = createNetwork<AgentState>({
      name: "coding-agent-network",
      agents: [codeAgent],
      maxIter: 15,
      defaultState: state,
      router: async ({ network }) => {
        const summary = network.state.data.summary;

        if (summary) {
          return;
        }

        return codeAgent;
      },
    });

    const result = await network.run(event.data.value, { state });

    const fragmentTitleGenerator = createAgent<AgentState>({
      name: "fragment-title-generator",
      description: "A fragment title generator",
      system: FRAGMENT_TITLE_PROMPT,
      model: openai({
        model: "gpt-4o",
      }),
    });

    const responseGenerator = createAgent<AgentState>({
      name: "response-generator",
      description: "A response generator",
      system: RESPONSE_PROMPT,
      model: openai({
        model: "gpt-4o",
      }),
    });

    const { output: fragmentTitleOutput } = await fragmentTitleGenerator.run(
      result.state.data.summary
    );
    const { output: responseOutput } = await responseGenerator.run(
      result.state.data.summary
    );

    const isError =
      !result.state.data.summary ||
      Object.keys(result.state.data.files || {}).length === 0;

    const sandboxUrl = await step.run("get-sandbox-url", async () => {
      const sandbox = await getSandbox(sandboxId);
      const host = sandbox.getHost(3000);
      return `https://${host}`;
    });

    const timestamp = new Date();

    let savedMsg: Prisma.MessageGetPayload<{
      include: { fragment: true };
    }> | null = null;

    await step.run("save-result-pre-consume", async () => {
      if (isError) {
        const errorMsg = await prisma.message.create({
          data: {
            projectId: event.data.projectId,
            content: "Something went wrong. Please try again.",
            role: "ASSISTANT",
            type: "ERROR",
          },
        });

        await publish(
          fragmentChannel(event.data.userId).error({
            projectId: event.data.projectId,
            status: "error",
            message: "Something went wrong. Please try again.",
            timestamp: timestamp,
          })
        );

        return errorMsg;
      }

      savedMsg = await prisma.message.create({
        data: {
          projectId: event.data.projectId,
          content: parseAgentOutput(responseOutput),
          role: "ASSISTANT",
          type: "RESULT",
          fragment: {
            create: {
              sandboxUrl: sandboxUrl,
              title: parseAgentOutput(fragmentTitleOutput),
              files: result.state.data.files,
            },
          },
        },
        include: {
          fragment: true,
        },
      });

      return { message: "Result saved, pending credit consumption" };
    });

    if (!isError) {
      await step.run("consume-credits", async () => {
        try {
          await consumeCredits(event.data.userId, event.data.effectivePoints);

          if (savedMsg) {
            await publish(
              fragmentChannel(event.data.userId).fragment({
                projectId: event.data.projectId,
                status: "completed",
                message: "Fragment generated successfully!",
                fragmentId: savedMsg.fragment?.id,
                messageId: savedMsg.id,
                sandboxUrl: savedMsg.fragment?.sandboxUrl,
                title: savedMsg.fragment?.title,
                timestamp,
              })
            );
          } else {
            console.error(
              "Inngest: savedMsg was null after successfull agent run and credit consumption attempt"
            );
          }
        } catch (error: unknown) {
          const errorMessageForUser =
            error && typeof error === "object" && "message" in error
              ? error.message
              : "An unexpected error occurred while processing your credits.";

          console.error(
            `Inngest: Failed to consume credits for user ${event.data.userId}:`,
            error
          );

          await publish(
            fragmentChannel(event.data.userId).error({
              projectId: event.data.projectId,
              status: "error",
              message: `Generation completed, but there was an issue consuming credits. Reason: ${errorMessageForUser}. No credits were consumed.`,
              timestamp: new Date(),
            })
          );

          return { message: errorMessageForUser };
        }
      });
    } else {
      console.log(
        `Inngest: Agent execution failed (isError was true), no credits consumed for ${event.data.userId}.`
      );
      return { message: "No credits consumed due to agent error" };
    }

    return {
      url: sandboxUrl,
      title: "Fragment",
      files: result.state.data.files,
      summary: result.state.data.summary,
    };
  }
);

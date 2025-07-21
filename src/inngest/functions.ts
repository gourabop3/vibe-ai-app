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
  type NetworkRun,
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

interface AgentState {
  summary: string;
  files: { [path: string]: string };
}

export const fragmentChannel = channel((userId: string) => `user:${userId}`)
  .addTopic(
    topic("completed").schema(
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
    let finalStatus: "completed" | "error" = "error";
    let finalMessage: string =
      "An unexpected error occurred during the generation process.";
    let finalFragmentId: string | undefined = undefined;
    let finalMessageId: string | undefined = undefined;
    let finalSandboxUrl: string | undefined = undefined;
    let finalTitle: string | undefined = undefined;
    const finalTimestamp = new Date();

    let isAgentCoreLogicSuccessful = false;
    let creditsConsumedSuccessfully = false;
    let agentErrorMessage: string | undefined;

    let agentRunResult: NetworkRun<AgentState> | null = null;

    try {
      const sandboxId = await step.run("get-sandbox-id", async () => {
        const sandbox = await Sandbox.create("code-interpreter-v1");
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
          apiKey: process.env.OPENAI_API_KEY,
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
                  void (await sandbox.commands.run(command, {
                    onStdout: (data: string) => {
                      buffers.stdout += data;
                    },
                    onStderr: (data: string) => {
                      buffers.stderr += data;
                    },
                  }));

                  if (buffers.stderr) {
                    return buffers.stderr;
                  }

                  return buffers.stdout;
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
                      void (await sandbox.files.write(file.path, file.content));
                      updatedFiles[file.path] = file.content;
                    }

                    return updatedFiles;
                  } catch (error) {
                    return "Error: " + error;
                  }
                }
              );

              if (typeof newFiles === "object" && newFiles !== null) {
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

      agentRunResult = await network.run(event.data.value, { state });

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

      const [{ output: fragmentTitleOutput }, { output: responseOutput }] =
        await Promise.all([
          await fragmentTitleGenerator.run(agentRunResult!.state.data.summary),
          await responseGenerator.run(agentRunResult!.state.data.summary),
        ]);

      const isAgentExecutionError =
        !agentRunResult.state.data.summary ||
        Object.keys(agentRunResult.state.data.files || {}).length === 0;

      const sandboxUrl = await step.run("get-sandbox-url", async () => {
        const sandbox = await getSandbox(sandboxId);
        const host = sandbox.getHost(3000);
        return `https://${host}`;
      });

      const savedDbMsg = await step.run("save-result", async () => {
        if (isAgentExecutionError) {
          void (await prisma.message.create({
            data: {
              projectId: event.data.projectId,
              content: "Something went wrong. Please try again.",
              role: "ASSISTANT",
              type: "ERROR",
            },
          }));
          return null;
        } else {
          const msg = await prisma.message.create({
            data: {
              projectId: event.data.projectId,
              content: parseAgentOutput(responseOutput),
              role: "ASSISTANT",
              type: "RESULT",
              fragment: {
                create: {
                  sandboxUrl: sandboxUrl,
                  title: parseAgentOutput(fragmentTitleOutput),
                  files: agentRunResult!.state.data.files,
                },
              },
            },
            include: {
              fragment: true,
            },
          });
          return msg;
        }
      });

      isAgentCoreLogicSuccessful = savedDbMsg !== null;

      if (isAgentCoreLogicSuccessful) {
        await step.run("consume-credits", async () => {
          try {
            void (await consumeCredits(
              event.data.userId,
              event.data.effectivePoints
            ));
            creditsConsumedSuccessfully = true;
            finalSandboxUrl = sandboxUrl;
          } catch (creditError: unknown) {
            finalMessage =
              creditError &&
              typeof creditError === "object" &&
              "message" in creditError
                ? `Generation completed, but there was an issue consuming credits. Reason: ${creditError.message}. No credits were consumed.`
                : "Generation completed, but an unexpected error occurred while consuming credits. No credits were consumed.";
            console.error(
              `Inngest: Failed to consume credits for user ${event.data.userId}:`,
              creditError
            );
          }
        });
      }

      if (agentErrorMessage) {
        finalStatus = "error";
        finalMessage = agentErrorMessage;
      } else if (!isAgentCoreLogicSuccessful) {
        finalStatus = "error";
        finalMessage = "Agent execution did not complete successfully.";
      } else if (!creditsConsumedSuccessfully) {
        finalStatus = "error";
      } else {
        finalStatus = "completed";
        finalMessage = "Fragment generated successfully!";

        if (savedDbMsg && savedDbMsg.fragment) {
          finalFragmentId = savedDbMsg.fragment.id;
          finalMessageId = savedDbMsg.id;
          finalTitle = savedDbMsg.fragment.title;
        } else {
          console.error(
            "Invariant violation: savedDbMsg or fragment missing in successful path."
          );

          finalFragmentId = undefined;
          finalMessageId = undefined;
          finalTitle = undefined;
        }
      }
    } catch (e: unknown) {
      finalStatus = "error";
      finalMessage =
        e && typeof e === "object" && "message" in e
          ? `An unexpected error occurred: ${e.message}`
          : "An unexpected error occurred during the generation process.";
      console.error("Unhandled error in codeAgentFunction:", e);
    }
    if (finalStatus === "completed") {
      void (await publish(
        fragmentChannel(event.data.userId).completed({
          projectId: event.data.projectId,
          status: "completed",
          message: finalMessage,
          fragmentId: finalFragmentId,
          messageId: finalMessageId!,
          sandboxUrl: finalSandboxUrl,
          title: finalTitle,
          timestamp: finalTimestamp,
        })
      ));
    } else {
      void (await publish(
        fragmentChannel(event.data.userId).error({
          projectId: event.data.projectId,
          status: "error",
          message: finalMessage,
          timestamp: finalTimestamp,
        })
      ));
    }

    return {
      url: finalSandboxUrl || "",
      title: finalTitle || "Generation Result",
      files: agentRunResult?.state?.data?.files || {},
      summary: agentRunResult?.state?.data?.summary || "",
    };
  }
);
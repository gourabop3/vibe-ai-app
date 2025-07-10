import { Sandbox } from "@e2b/code-interpreter";
import { AgentResult, Message, TextMessage } from "@inngest/agent-kit";

import { SANDBOX_TIMEOUT } from "./types";

export async function getSandbox(sandboxId: string) {
  const sandbox = await Sandbox.connect(sandboxId);
  await sandbox.setTimeout(SANDBOX_TIMEOUT);
  return sandbox;
}

export function lastAssistantTextMessageContent(result: AgentResult) {
  if (!result.output || !Array.isArray(result.output)) {
    return undefined;
  }

  const lastAssistantTextMessageIndex = result.output.findLastIndex(
    (message) => message.role === "assistant"
  );

  if (lastAssistantTextMessageIndex === -1) {
    return undefined;
  }

  const message = result.output[lastAssistantTextMessageIndex] as
    | TextMessage
    | undefined;

  return message?.content
    ? typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
      ? message.content
          .filter((c) => c && typeof c.text === "string")
          .map((c) => c.text)
          .join("")
      : undefined
    : undefined;
}

export const parseAgentOutput = (value: Message[]): string => {
  const output = value[0];

  if (output.type !== "text") {
    return "Fragment";
  }

  if (Array.isArray(output.content)) {
    return output.content.map((txt) => txt).join("");
  }

  return output.content;
};

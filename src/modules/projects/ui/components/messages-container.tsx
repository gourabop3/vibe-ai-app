import { toast } from "sonner";
import { useCallback, useEffect, useRef } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/client";
import { Fragment } from "@/generated/prisma";
import { useGenerationStatus } from "@/contexts/generation-status-context";
import { useCustomInngestSubscription } from "@/hooks/use-custom-inngest-subscription";

import { MessageCard } from "./message-card";
import { MessageForm } from "./message-form";
import { MessageLoading } from "./message-loading";

interface Props {
  projectId: string;
  activeFragment: Fragment | null;
  setActiveFragment: (fragment: Fragment | null) => void;
}

const MessagesContainer = ({
  projectId,
  activeFragment,
  setActiveFragment,
}: Props) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastAssistantMessageIdRef = useRef<string | null>(null);

  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { setIsGenerating } = useGenerationStatus();

  const { data: messages } = useSuspenseQuery(
    trpc.messages.getMany.queryOptions({
      projectId,
    })
  );

  const refreshToken = useCallback(async () => {
    try {
      const mutationOptions =
        trpc.messages.getFragmentSubscriptionToken.mutationOptions();
      const mutationFn = mutationOptions.mutationFn;

      if (!mutationFn) {
        console.error("Mutation function is not available");
        return null;
      }

      const token = await mutationFn({ projectId });

      return token;
    } catch (error) {
      console.error("Failed to get subscription token:", error);
      return null;
    }
  }, [trpc.messages.getFragmentSubscriptionToken, projectId]);

  const { latestData, error, cleanup } = useCustomInngestSubscription({
    refreshToken,
    enabled: true,
  });

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  useEffect(() => {
    if (error) {
      console.error("Subscription error:", error);
      toast.error("Realtime updates disconnected. Please refresh.");
      setIsGenerating(false);
    }
  }, [error, setIsGenerating]);

  const invalidateMessages = useCallback(
    () =>
      void queryClient.invalidateQueries(
        trpc.messages.getMany.queryOptions({ projectId })
      ),
    [queryClient, trpc.messages.getMany, projectId]
  );

  const invalidateUsage = useCallback(
    () => void queryClient.invalidateQueries(trpc.usage.status.queryOptions()),
    [queryClient, trpc.usage.status]
  );

  useEffect(() => {
    if (!latestData) return;

    if (latestData.topic === "completed") {
      invalidateMessages();
      invalidateUsage();
      setIsGenerating(false);
      alert("COMPLETED");
    }

    if (latestData.topic === "error") {
      console.log("Agent error:", latestData.data.message);
      invalidateMessages();
      invalidateUsage();
      setIsGenerating(false);
      alert("ERROR");
    }
  }, [latestData, invalidateMessages, invalidateUsage, setIsGenerating]);

  useEffect(() => {
    const lastAssistantMessage = messages.findLast(
      (message) => message.role === "ASSISTANT"
    );

    if (
      lastAssistantMessage?.fragment &&
      lastAssistantMessage.id !== lastAssistantMessageIdRef.current
    ) {
      setActiveFragment(lastAssistantMessage.fragment);
      lastAssistantMessageIdRef.current = lastAssistantMessage.id;
    }
  }, [messages, setActiveFragment]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [messages.length]);

  const lastMessage = messages[messages.length - 1];
  const isLastMessageUser = lastMessage && lastMessage.role === "USER";

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="pt-2 pr-1">
          {messages.map((message) => (
            <MessageCard
              key={message.id}
              content={message.content}
              role={message.role}
              fragment={message.fragment}
              createdAt={message.createdAt}
              isActiveFragment={activeFragment?.id === message.fragment?.id}
              onFragmentClick={() => setActiveFragment(message.fragment)}
              type={message.type}
            />
          ))}
          {isLastMessageUser && <MessageLoading />}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="relative p-3 pt-1">
        <div className="absolute -top-6 left-0 right-0 h-6 bg-gradient-to-b from-transparent to-background pointer-events-none" />
        <MessageForm projectId={projectId} />
      </div>
    </div>
  );
};

export default MessagesContainer;

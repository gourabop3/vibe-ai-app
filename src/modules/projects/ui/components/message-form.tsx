import { z } from "zod";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import TextareaAutosize from "react-textarea-autosize";
import { ArrowUpIcon, Loader2Icon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Form, FormField } from "@/components/ui/form";

import Usage from "./usage";
import { GENERATION_COST } from "@/lib/usage";

import { useGenerationStatus } from "@/contexts/generation-status-context";

interface Props {
  projectId: string;
}

const formSchema = z.object({
  value: z.string().min(1, { message: "Message is required" }).max(10000, {
    message: "Message is too long",
  }),
});

export const MessageForm = ({ projectId }: Props) => {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isGenerating, setIsGenerating } = useGenerationStatus();

  const { data: usage } = useQuery(trpc.usage.status.queryOptions());

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      value: "",
    },
  });

  const createMessage = useMutation(
    trpc.messages.create.mutationOptions({
      onMutate: async () => {
        setIsGenerating(true);

        const usageQueryOptions = trpc.usage.status.queryOptions();
        const usageQueryKey = trpc.usage.status.queryKey();

        await queryClient.cancelQueries(usageQueryOptions);

        const previousUsage = queryClient.getQueryData(usageQueryKey);

        if (previousUsage) {
          queryClient.setQueryData(usageQueryKey, (oldData) => {
            if (!oldData) return oldData;

            const updated = {
              ...oldData,
              remainingPoints: Math.max(
                0,
                oldData.remainingPoints - GENERATION_COST
              ),
              consumedPoints: oldData.consumedPoints + GENERATION_COST,
            };

            (updated as any).toJSON =
              (oldData as any).toJSON ||
              function (this: typeof oldData) {
                if (!this) {
                  console.warn("toJSON called with undefined 'this' context");
                  return {};
                }
                return { ...this };
              };

            return updated as typeof oldData;
          });
        }

        return { previousUsage };
      },
      onSuccess: () => {
        form.reset();
        void queryClient.invalidateQueries(
          trpc.messages.getMany.queryOptions({
            projectId,
          })
        );
      },
      onError: (
        error,
        _variables,
        context?: { previousUsage?: typeof usage }
      ) => {
        if (context?.previousUsage) {
          const usageQueryOptions = trpc.usage.status.queryOptions();
          const queryKey = usageQueryOptions.queryKey;
          void queryClient.setQueryData(queryKey, context.previousUsage);
        }

        toast.error(error.message);

        if (error.data?.code === "TOO_MANY_REQUESTS") {
          router.push("/pricing");
        }

        setIsGenerating(false);
      },
    })
  );

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    await createMessage.mutateAsync({
      value: values.value,
      projectId,
    });
  };

  const [isFocused, setIsFocused] = useState(false);
  const showUsage = !!usage;
  const isPending = createMessage.isPending;
  const isFormDisabled = isPending || isGenerating;
  const isButtonDisabled = isFormDisabled || !form.formState.isValid;

  useEffect(() => {
    console.log("\n\n\n");
    console.log(`isPending: ${isPending}`);
    console.log(`isGenerating: ${isGenerating}`);
    console.log("\n\n\n");
  }, [isPending, isGenerating]);

  return (
    <Form {...form}>
      {showUsage && (
        <Usage
          points={usage.remainingPoints}
          msBeforeNext={usage.msBeforeNext}
        />
      )}
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn(
          "relative border p-4 pt-1 rounded-xl bg-sidebar dark:bg-sidebar transition-all",
          isFocused && "shadow-xs",
          showUsage && "rounded-t-none"
        )}
      >
        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <TextareaAutosize
              {...field}
              disabled={isFormDisabled}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              minRows={2}
              maxRows={8}
              className={cn(
                "pt-4 resize-none border-none w-full outline-none bg-transparent",
                isFormDisabled && "cursor-not-allowed"
              )}
              placeholder="What would you like to build?"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  if (!isFormDisabled) {
                    form.handleSubmit(onSubmit)(e);
                  }
                }
              }}
            />
          )}
        />
        <div className="flex gap-x-2 items-end justify-between pt-2">
          <div className="text-[10px] text-muted-foreground font-mono">
            <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span>&#8984;</span> Enter
            </kbd>
            &nbsp;to submit
          </div>
          <Button
            className={cn(
              "size-8 rounded-full",
              isButtonDisabled && "bg-muted-foreground border"
            )}
            disabled={isButtonDisabled}
          >
            {isFormDisabled ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <ArrowUpIcon />
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
};

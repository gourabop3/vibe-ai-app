import { useEffect, useRef, useState } from "react";
import { Realtime } from "@inngest/realtime";
import { useInngestSubscription } from "@inngest/realtime/hooks";

type InngestMessage =
  | {
      topic: string;
      channel: string;
      data: any;
      runId?: string;
      fnId?: string;
      createdAt: Date;
      envId?: string;
      kind: "data";
    }
  | {
      topic: string;
      channel: string;
      data: any;
      kind: "datastream-start" | "datastream-end" | "chunk";
      streamId: string;
      stream: ReadableStream<any>;
    };

export function useCustomInngestSubscription<T>({
  token,
  refreshToken,
  enabled = true,
}: {
  token?: Realtime.Subscribe.Token<Realtime.Channel> | null;
  refreshToken?: () => Promise<Realtime.Subscribe.Token<Realtime.Channel> | null>;
  enabled?: boolean;
}) {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const isMountedRef = useRef(true);

  const subscription = useInngestSubscription({
    token,
    refreshToken,
    enabled: isEnabled && isMountedRef.current,
  });

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      setIsEnabled(false);
    };
  }, []);

  useEffect(() => {
    if (isMountedRef.current) {
      setIsEnabled(enabled);
    }
  }, [enabled]);

  return {
    ...subscription,
    cleanup: () => setIsEnabled(false),
  };
}

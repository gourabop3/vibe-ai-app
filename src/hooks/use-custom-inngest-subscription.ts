import { useEffect, useRef, useState } from "react";
import { Realtime } from "@inngest/realtime";
import { useInngestSubscription } from "@inngest/realtime/hooks";

export function useCustomInngestSubscription({
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

"use client";

import { GenerationStatusProvider } from "@/contexts/generation-status-context";
import { PropsWithChildren } from "react";

export const GenerationStatusWrapper = ({ children }: PropsWithChildren) => {
  return <GenerationStatusProvider>{children}</GenerationStatusProvider>;
};

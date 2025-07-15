"use client";

import { createContext, ReactNode, useContext, useState } from "react";

interface GenerationStatusContextType {
  isGenerating: boolean;
  setIsGenerating: (status: boolean) => void;
}

const GenerationStatusContext = createContext<
  GenerationStatusContextType | undefined
>(undefined);

export const useGenerationStatus = () => {
  const context = useContext(GenerationStatusContext);
  if (context === undefined) {
    throw new Error(
      "useGenerationStatus must be used within a GenerationStatusProvider"
    );
  }

  return context;
};

export const GenerationStatusProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [isGenerating, setIsGenerating] = useState(false);

  return (
    <GenerationStatusContext.Provider value={{ isGenerating, setIsGenerating }}>
      {children}
    </GenerationStatusContext.Provider>
  );
};

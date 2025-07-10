"use client";

import { dark } from "@clerk/themes";
import { SignUp } from "@clerk/nextjs";

import { useCurrentTheme } from "@/hooks/use-current-theme";

const SignUpClient = () => {
  const currentTheme = useCurrentTheme();

  return (
    <SignUp
      appearance={{
        baseTheme: currentTheme === "dark" ? dark : undefined,
        elements: {
          cardBox: "border! shadow-none! rounded-lg!",
        },
      }}
    />
  );
};

export default SignUpClient;

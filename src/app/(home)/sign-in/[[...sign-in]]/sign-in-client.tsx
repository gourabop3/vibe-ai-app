"use client";

import { dark } from "@clerk/themes";
import { SignIn } from "@clerk/nextjs";

import { useCurrentTheme } from "@/hooks/use-current-theme";

const SignInClient = () => {
  const currentTheme = useCurrentTheme();

  return (
    <SignIn
      appearance={{
        baseTheme: currentTheme === "dark" ? dark : undefined,
        elements: {
          cardBox: "border! shadow-none! rounded-lg!",
        },
      }}
    />
  );
};

export default SignInClient;

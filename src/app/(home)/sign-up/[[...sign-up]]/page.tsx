import { Metadata } from "next";
import SignUpClient from "./sign-up-client";

export const metadata: Metadata = {
  title: "Sign Up",
};

const Page = () => {
  return (
    <div className="flex flex-col max-w-3xl mx-auto w-full">
      <section className="space-y-6 pt-[16vh] 2xl:pt-48">
        <div className="flex flex-col items-center">
          <SignUpClient />
        </div>
      </section>
    </div>
  );
};

export default Page;

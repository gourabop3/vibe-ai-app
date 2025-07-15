# Vibe AI App

## 🌟 Overview

The Vibe AI App is an innovative web application that leverages advanced AI models and a sandboxed code interpreter to generate functional code fragments from natural language prompts. Users can describe what they want to build, and the AI agent will attempt to generate the corresponding code, provide a summary, and display the generated files within a secure sandbox environment. The application includes a credit-based usage system and provides real-time updates on the generation process.

## ✨ Features

- **AI-Powered Code Generation:** Transform natural language descriptions into executable code fragments using intelligent agents.
- **Secure Sandboxed Execution:** Generated code runs in an isolated E2B Code Interpreter environment, ensuring security and preventing system interference.
- **Real-time Status Updates:** Get instant feedback on the code generation process (e.g., `completed`, `error`) via Inngest Realtime.
- **User Authentication:** Secure user management and authentication powered by Clerk.
- **Credit-Based Usage:** A robust system to track and consume user credits for AI generation, with optimistic UI updates.
- **Project Management:** Store and retrieve generated fragments and their associated messages in a database.
- **Pre-defined Templates:** Quickly start new projects using popular pre-set prompts.
- **Intuitive UI:** Built with Next.js and Tailwind CSS for a responsive and modern user experience.

## 🚀 Technologies Used

- **Frontend:**
  - [Next.js](https://nextjs.org/) (App Router)
  - [React](https://react.dev/)
  - [TypeScript](https://www.typescriptlang.org/)
  - [Tailwind CSS](https://tailwindcss.com/)
  - [TanStack React Query](https://tanstack.com/query/latest/docs/react/overview) for data fetching and caching.
  - [Zod](https://zod.dev/) for schema validation.
  - [React Hook Form](https://react-hook-form.com/) for form management.
  - [Sonner](https://sonner.emilkowal.ski/) for toasts.
  - [`react-textarea-autosize`](https://github.com/andreypopp/react-textarea-autosize) for dynamic textarea sizing.
  - [Clerk](https://clerk.com/) for authentication.
- **Backend & AI Orchestration:**
  - [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) (used with TRPC).
  - [Inngest](https://www.inngest.com/) for background functions, workflow orchestration, and real-time events.
  - [`@inngest/agent-kit`](https://www.inngest.com/docs/sdk/agent-kit) for building and managing AI agents within Inngest functions.
  - [E2B Code Interpreter](https://e2b.dev/) for secure, sandboxed code execution and file management.
  - [OpenAI API](https://openai.com/docs/api/) (GPT-4.1, GPT-4o) for AI model inference.
  - [Prisma](https://www.prisma.io/) as the ORM for database interactions.
  - [tRPC](https://trpc.io/) for building strongly typed end-to-end APIs.
- **Database:** PostgreSQL (or any other relational database supported by Prisma).

## 🛠️ Getting Started

### Prerequisites

- Node.js (LTS recommended)
- Yarn or npm
- A PostgreSQL (or compatible) database instance.
- Accounts and API Keys for:
  - [Clerk](https://clerk.com/)
  - [OpenAI](https://platform.openai.com/api-keys)
  - [E2B Code Interpreter](https://e2b.dev/)
  - [Inngest](https://www.inngest.com/)

### Installation

1.  **Clone the repository:**

    ```bash
    git clone [https://github.com/your-username/vibe-ai-app.git](https://github.com/your-username/vibe-ai-app.git)
    cd vibe-ai-app
    ```

2.  **Install dependencies:**

    ```bash
    yarn install
    # or
    npm install
    ```

3.  **Set up Environment Variables:**
    Create a `.env.local` file in the root of your project and add the following:

    ```env
    # Database
    DATABASE_URL="postgresql://user:password@host:port/database?schema=public"

    # Clerk Authentication
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_YOUR_CLERK_PUBLISHABLE_KEY
    CLERK_SECRET_KEY=sk_live_YOUR_CLERK_SECRET_KEY

    # OpenAI API Key
    OPENAI_API_KEY=sk-YOUR_OPENAI_API_KEY

    # E2B Code Interpreter
    E2B_API_KEY=YOUR_E2B_API_KEY

    # Inngest
    INNGEST_SIGNING_KEY=your_inngest_signing_key_from_dashboard
    INNGEST_EVENT_KEY=your_inngest_event_key_from_dashboard
    NEXT_PUBLIC_INNGEST_APP_ORIGIN=http://localhost:3000 # Or your deployment URL
    ```

4.  **Database Setup:**
    Apply Prisma migrations to create your database schema:
    ```bash
    npx prisma migrate dev --name init
    ```

### Running the Development Server

```bash
yarn dev
# or
npm run dev
```

This will create an optimized production build in the `.next` folder.

## 💡 Usage

1. **Sign Up/Log in:** Access the application and authenticate using Clerk.

2. **Enter Prompt:** Navigate to the project creation area (e.g., `/projects/new` or the home page) and type your desired code generation prompt in the input field. You can also select from pre-defined templates.

3. **Generate:** Click the "Generate" button.

4. **Monitor Progress:** The application will provide real-time updates as the AI processes your request, interacts with the code interpreter, saves results, and consumes credits.

5. **View Result:** Once completed, you will be redirected to the project view where you can see the generated code, summary, and sandbox URL.

## 📂 Project Structure (Key Directories)

```
.
├── app/                  # Next.js App Router root, containing pages, layouts, and API routes
│   ├── (auth)/           # Clerk authentication routes (e.g., sign-in, sign-up)
│   ├── projects/         # Project-related pages and dynamic routes
│   ├── api/              # Next.js API routes (e.g., for Inngest, tRPC)
│   ├── favicon.ico       # Application favicon
│   └── ...
├── components/           # Reusable React components
├── contexts/             # React Contexts (e.g., GenerationStatusContext)
├── inngest/              # Inngest-related configuration and background functions
│   ├── client.ts         # Inngest client setup
│   ├── functions.ts      # Core Inngest functions (like `codeAgentFunction`)
│   └── utils.ts          # Utility functions for Inngest functions
├── lib/                  # Utility functions and shared logic (e.g., db, utils, usage)
├── modules/              # Feature-specific modules (e.g., projects/ui/views)
├── prompt/               # AI prompt definitions
├── prisma/               # Prisma schema and migrations
├── trpc/                 # tRPC client and server setup
│   ├── client.ts         # tRPC client
│   └── server.ts         # tRPC server
└── ...
```

## 🙏 Acknowledgments & Personal Contributions

This project was developed following a [comprehensive tutorial](https://www.youtube.com/watch?v=xs8mWnbMcmc&t=5413s) by [Code with Antonio](https://www.youtube.com/@codewithantonio). His guidance was instrumental in building the core functionality of the application.

Through this project, I gained valuable hands-on experience and learned:

- **tRPC:** How to build type-safe APIs end-to-end.

- **Inngest:** How to work with robust background functions, orchestrate complex workflows, and manage durable execution.

- **E2B Code Interpreter:** The practical application of a secure, sandboxed environment for code execution.

- **Clerk:** Implementing a powerful authentication and user management system, including billing integration.

**Beyond the tutorial, I personally implemented the following enhancements:**

- **Real-time UI Notifications:** Integrated `@inngest/realtime` to enable instant UI updates without polling, ensuring users receive immediate feedback on job status changes (`completed`, `error`) as Inngest publishes events.

- **Optimistic UI Updates for Credit Consumption:** Implemented optimistic updates for user credit balances, providing a snappier and more responsive user experience during AI generation requests.

## 📄 License

See the [LICENSE](https://github.com/RuiMNFilipe/vibe-ai-app/blob/main/LICENSE) file for license rights and limitations (MIT).

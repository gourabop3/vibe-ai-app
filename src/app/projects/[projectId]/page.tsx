import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { getQueryClient, trpc } from "@/trpc/server";

import { ProjectView } from "@/modules/projects/ui/views/project-view";
import { GenerationStatusWrapper } from "@/modules/projects/ui/components/generation-status-wrapper";

interface Props {
  params: Promise<{
    projectId: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { projectId } = await params;

  const queryClient = getQueryClient();
  const currentProject = await queryClient.fetchQuery(
    trpc.projects.getOne.queryOptions({
      id: projectId,
    })
  );

  return {
    title: currentProject.name,
  };
}

const ProjectPage = async ({ params }: Props) => {
  const { projectId } = await params;

  const queryClient = getQueryClient();
  await Promise.all([
    void queryClient.prefetchQuery(
      trpc.messages.getMany.queryOptions({
        projectId,
      })
    ),
    void queryClient.prefetchQuery(
      trpc.projects.getOne.queryOptions({
        id: projectId,
      })
    ),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ErrorBoundary fallback={<p>Error</p>}>
        <Suspense fallback={<p>Loading...</p>}>
          <GenerationStatusWrapper>
            <ProjectView projectId={projectId} />
          </GenerationStatusWrapper>
        </Suspense>
      </ErrorBoundary>
    </HydrationBoundary>
  );
};

export default ProjectPage;

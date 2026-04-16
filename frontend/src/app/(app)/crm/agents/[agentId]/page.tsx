import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ agentId: string }>;
}

export default async function CRMAgentDetailRedirect({ params }: Props) {
  const { agentId } = await params;
  redirect(`/agents/${agentId}`);
}

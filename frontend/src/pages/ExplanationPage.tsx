import { useIdeasAuth } from "@/hooks/useIdeasAuth";
import { useIdeasData } from "@/hooks/useIdeasData";
import IdeasLayout from "@/components/Ideas/IdeasLayout";
import { ExplanationView } from "@/components/Ideas";
import { SEO } from "@/components/SEO";

export default function ExplanationPage() {
  const auth = useIdeasAuth();
  const ideasData = useIdeasData(auth);

  return (
    <IdeasLayout auth={auth} ideasData={ideasData}>
      <SEO
        title="How It Works"
        description="Learn how JustSpark works: submit ideas, vote, fund, and build together on Solana."
        path="/explanation"
      />
      <ExplanationView />
    </IdeasLayout>
  );
}

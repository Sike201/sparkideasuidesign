import { Outlet } from "react-router-dom";
import IdeasLayout from "@/components/Ideas/IdeasLayout";
import { useIdeasAuth } from "@/hooks/useIdeasAuth";
import type { UseIdeasAuthReturn } from "@/hooks/useIdeasAuth";
import { useIdeasData } from "@/hooks/useIdeasData";
import type { UseIdeasDataReturn } from "@/hooks/useIdeasData";

/** Passed to `useOutletContext()` from Ideas list + detail routes (single layout = one Aurora mount). */
export type IdeasSectionOutletContext = {
  auth: UseIdeasAuthReturn;
  ideasData: UseIdeasDataReturn;
};

/**
 * Keeps IdeasLayout + WebGL Aurora mounted while navigating between `/ideas` and `/ideas/:slug`,
 * avoiding teardown/re-init flashes.
 */
export default function IdeasSectionLayout() {
  const auth = useIdeasAuth();
  const ideasData = useIdeasData(auth);
  const ctx: IdeasSectionOutletContext = { auth, ideasData };

  return (
    <IdeasLayout auth={auth} ideasData={ideasData}>
      <Outlet context={ctx} />
    </IdeasLayout>
  );
}

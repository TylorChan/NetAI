"use client";

import { useParams } from "next/navigation";
import WorkspaceView from "@/components/WorkspaceView";

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId;

  return <WorkspaceView initialSessionId={sessionId} />;
}

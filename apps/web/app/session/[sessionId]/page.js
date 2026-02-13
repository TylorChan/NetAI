"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import SessionActions from "@/components/SessionActions";
import TranscriptPanel from "@/components/TranscriptPanel";
import { graphqlRequest, mutations, queries } from "@/lib/graphql";
import { useRealtimeSession } from "@/features/voice/useRealtimeSession";

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.sessionId;

  const [resume, setResume] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [followupEmail, setFollowupEmail] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { status: realtimeStatus, connect, disconnect, events } = useRealtimeSession();

  const loadResume = useCallback(async () => {
    const data = await graphqlRequest(queries.getSessionResume, { sessionId });
    setResume(data.getSessionResume);
  }, [sessionId]);

  const loadEvaluation = useCallback(async () => {
    const data = await graphqlRequest(queries.getSessionEvaluation, { sessionId });
    setEvaluation(data.getSessionEvaluation);
  }, [sessionId]);

  useEffect(() => {
    loadResume().catch((loadError) => setError(loadError.message));
    loadEvaluation().catch(() => {});
  }, [loadResume, loadEvaluation]);

  useEffect(() => {
    if (!resume?.session || resume.session.status !== "PROCESSING_EVALUATION") return;

    const timer = setInterval(() => {
      loadEvaluation().catch(() => {});
      loadResume().catch(() => {});
    }, 4000);

    return () => clearInterval(timer);
  }, [loadEvaluation, loadResume, resume?.session]);

  async function handleSendTurn(content) {
    setLoading(true);
    setError("");

    try {
      await graphqlRequest(mutations.appendSessionTurn, {
        input: {
          sessionId,
          role: "user",
          content
        }
      });
      await loadResume();
    } catch (appendError) {
      setError(appendError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFinalize() {
    setLoading(true);
    setError("");

    try {
      await graphqlRequest(mutations.finalizeNetworkingSession, { sessionId });
      await loadResume();
      await loadEvaluation();
    } catch (finalizeError) {
      setError(finalizeError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateEmail() {
    setLoading(true);
    setError("");

    try {
      const data = await graphqlRequest(mutations.generateFollowupEmail, {
        input: {
          sessionId,
          tone: "professional",
          length: "medium"
        }
      });
      setFollowupEmail(data.generateFollowupEmail);
    } catch (emailError) {
      setError(emailError.message);
    } finally {
      setLoading(false);
    }
  }

  const turns = useMemo(() => resume?.recentTurns ?? [], [resume?.recentTurns]);

  return (
    <section className="session-grid">
      <div className="panel">
        <p className="tag">Session</p>
        <h2>{resume?.session?.goal || "Loading..."}</h2>
        <p className="muted">Session ID: {sessionId}</p>
        <p>{resume?.contextSummary || "Loading context..."}</p>
      </div>

      <SessionActions
        onSendTurn={handleSendTurn}
        onFinalize={handleFinalize}
        onGenerateEmail={handleGenerateEmail}
        loading={loading}
        status={resume?.session?.status || "UNKNOWN"}
        realtimeStatus={realtimeStatus}
        onRealtimeConnect={connect}
        onRealtimeDisconnect={disconnect}
      />

      <TranscriptPanel turns={turns} />

      <div className="panel">
        <h3>Realtime Events</h3>
        {events.length === 0 ? <p className="muted">No events yet.</p> : null}
        <ul className="events">
          {events.map((event, index) => (
            <li key={`${event.ts}-${index}`}>
              <strong>{new Date(event.ts).toLocaleTimeString()}:</strong> {event.message}
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <h3>Evaluation</h3>
        {evaluation ? (
          <>
            <p className="score">Score: {evaluation.score}/10</p>
            <p><strong>Strengths:</strong> {evaluation.strengths.join("; ")}</p>
            <p><strong>Improvements:</strong> {evaluation.improvements.join("; ")}</p>
            <p><strong>Next Actions:</strong> {evaluation.nextActions.join("; ")}</p>
          </>
        ) : (
          <p className="muted">No evaluation yet.</p>
        )}
      </div>

      <div className="panel">
        <h3>Follow-up Email</h3>
        {followupEmail ? (
          <>
            <p><strong>Subject:</strong> {followupEmail.subject}</p>
            <pre>{followupEmail.body}</pre>
          </>
        ) : (
          <p className="muted">Generate email from the action panel.</p>
        )}
      </div>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}

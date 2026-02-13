"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { graphqlRequest, mutations, queries } from "@/lib/graphql";

const DEFAULT_TARGET_CONTEXT =
  "Target professional context: engineering manager in a SaaS/AI team, focused on cross-functional product delivery.";
const DEFAULT_CUSTOM_CONTEXT =
  "Practice friendly small-talk opening, ask deeper project questions, then close with one recruiting advice request.";

export default function ContextSetupForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState([]);
  const [form, setForm] = useState({
    userId: "default-user",
    goal: "Networking with software engineering managers",
    targetProfileContext: "",
    customContext: ""
  });

  function onChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  const loadSessions = useCallback(async (userId) => {
    if (!userId?.trim()) {
      setSessions([]);
      return;
    }

    setLoadingSessions(true);
    setError("");

    try {
      const data = await graphqlRequest(queries.sessions, { userId: userId.trim() });
      setSessions(data.sessions || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    loadSessions(form.userId).catch(() => {});
  }, [form.userId, loadSessions]);

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const targetProfileContext = form.targetProfileContext.trim() || DEFAULT_TARGET_CONTEXT;
      const customContext = form.customContext.trim() || DEFAULT_CUSTOM_CONTEXT;
      const data = await graphqlRequest(mutations.startNetworkingSession, {
        input: {
          userId: form.userId.trim(),
          goal: form.goal.trim(),
          targetProfileContext,
          customContext
        }
      });
      const sessionId = data.startNetworkingSession.id;
      router.push(`/session/${sessionId}`);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2>Create Practice Session</h2>
      <label>
        User ID
        <input name="userId" value={form.userId} onChange={onChange} required />
      </label>
      <label>
        Goal
        <input name="goal" value={form.goal} onChange={onChange} required />
      </label>
      <label>
        Target Profile Context
        <textarea
          name="targetProfileContext"
          value={form.targetProfileContext}
          onChange={onChange}
          rows={4}
        />
      </label>
      <label>
        Custom Context
        <textarea
          name="customContext"
          value={form.customContext}
          onChange={onChange}
          rows={5}
        />
      </label>

      {error ? <p className="error">{error}</p> : null}

      <button type="submit" disabled={loading}>
        {loading ? "Creating..." : "Start Networking Practice"}
      </button>

      <div className="resume-list">
        <h3>Resume Existing Session</h3>
        {loadingSessions ? <p className="muted">Loading sessions...</p> : null}
        {!loadingSessions && sessions.length === 0 ? (
          <p className="muted">No saved sessions for this user yet.</p>
        ) : null}
        <ul>
          {sessions.map((session) => (
            <li key={session.id} className="resume-item">
              <div>
                <strong>{session.goal}</strong>
                <p className="muted">
                  {session.status} · {session.stageState} ·{" "}
                  {new Date(session.updatedAt).toLocaleString()}
                </p>
              </div>
              <button type="button" onClick={() => router.push(`/session/${session.id}`)}>
                Open
              </button>
            </li>
          ))}
        </ul>
      </div>
    </form>
  );
}

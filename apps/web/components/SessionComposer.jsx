"use client";

import { useMemo, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { graphqlRequest, mutations } from "@/lib/graphql";

const DEFAULT_TARGET_CONTEXT =
  "Target professional context: engineering manager in a SaaS/AI team, focused on cross-functional product delivery.";
const DEFAULT_CUSTOM_CONTEXT =
  "Practice friendly small-talk opening, ask deeper project questions, then close with one recruiting advice request.";

export default function SessionComposer({
  onCreated,
  onCancel,
  mode = "inline"
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    goal: "Networking with software engineering managers",
    targetProfileContext: "",
    customContext: ""
  });

  const layoutClass = useMemo(
    () => `composer-form ${mode === "overlay" ? "composer-overlay-layout" : "composer-inline-layout"}`,
    [mode]
  );

  function onChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const targetProfileContext = form.targetProfileContext.trim() || DEFAULT_TARGET_CONTEXT;
      const customContext = form.customContext.trim() || DEFAULT_CUSTOM_CONTEXT;

      const data = await graphqlRequest(mutations.startNetworkingSession, {
        input: {
          goal: form.goal.trim(),
          targetProfileContext,
          customContext
        }
      });

      onCreated?.({
        sessionId: data.startNetworkingSession.id
      });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={layoutClass} onSubmit={onSubmit}>
      <div className={mode === "overlay" ? "composer-overlay-scroll" : ""}>
        <div className="composer-head">
          <h2>Start New Practice</h2>
          {onCancel ? (
            <button type="button" className="ghost-button" onClick={onCancel} disabled={loading}>
              Close
            </button>
          ) : null}
        </div>

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
      </div>

      <div className={mode === "overlay" ? "composer-overlay-actions" : ""}>
        {error ? <p className="error">{error}</p> : null}

        <button type="submit" disabled={loading} className="with-spinner composer-submit-button">
          {loading ? <LoadingSpinner /> : null}
          <span>{loading ? "Starting..." : "Start Practice"}</span>
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { graphqlRequest, mutations } from "@/lib/graphql";

export default function ContextSetupForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    userId: "default-user",
    goal: "Networking with software engineering managers",
    targetProfileContext: "Engineering manager at a B2B SaaS company. Interested in AI product delivery and cross-team collaboration.",
    customContext: "I want to improve small-talk openings and ask better follow-up questions about team impact and hiring expectations."
  });

  function onChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const data = await graphqlRequest(mutations.startNetworkingSession, {
        input: form
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
    </form>
  );
}

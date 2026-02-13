"use client";

import { useState } from "react";

export default function SessionActions({
  onSendTurn,
  onFinalize,
  onGenerateEmail,
  loading,
  status,
  realtimeStatus,
  onRealtimeConnect,
  onRealtimeDisconnect
}) {
  const [content, setContent] = useState("");

  async function submitTurn(event) {
    event.preventDefault();
    if (!content.trim()) return;
    await onSendTurn(content);
    setContent("");
  }

  return (
    <div className="panel">
      <h3>Live Session Controls</h3>
      <p className="muted">Session Status: {status}</p>
      <p className="muted">Realtime Status: {realtimeStatus}</p>

      <div className="button-row">
        {realtimeStatus === "CONNECTED" ? (
          <button type="button" onClick={onRealtimeDisconnect}>Disconnect Voice</button>
        ) : (
          <button type="button" onClick={onRealtimeConnect}>Connect Voice</button>
        )}
        <button type="button" onClick={onFinalize} disabled={loading}>
          Finalize + Queue Rating
        </button>
        <button type="button" onClick={onGenerateEmail} disabled={loading}>
          Generate Follow-up Email
        </button>
      </div>

      <form className="turn-form" onSubmit={submitTurn}>
        <label>
          Add Text Turn
          <textarea
            rows={3}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Type what the user said..."
          />
        </label>
        <button type="submit" disabled={loading}>Append User Turn</button>
      </form>
    </div>
  );
}

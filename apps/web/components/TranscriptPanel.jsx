"use client";

import { useEffect, useRef } from "react";

export default function TranscriptPanel({ turns, className = "" }) {
  const listRef = useRef(null);

  useEffect(() => {
    if (!listRef.current) {
      return;
    }

    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [turns]);

  return (
    <div className={`panel transcript ${className}`.trim()}>
      <div className="transcript-header">
        <h3 className="transcript-title">Conversation</h3>
      </div>

      <div ref={listRef} className="transcript-stream">
        {turns.length === 0 ? <p className="muted">No turns yet.</p> : null}
        {turns.map((turn) => (
          <article
            key={turn.id}
            className={`transcript-row ${
              turn.role === "user"
                ? "user"
                : turn.role === "assistant"
                  ? "assistant"
                  : "system"
            }`}
          >
            <div className="message-bubble">
              <div className="message-role">{turn.role === "user" ? "YOU" : turn.role.toUpperCase()}</div>
              <p className="message-text">{turn.content}</p>
              <small className="message-time">{new Date(turn.createdAt).toLocaleString()}</small>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

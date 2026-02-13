"use client";

export default function TranscriptPanel({ turns }) {
  return (
    <div className="panel transcript">
      <h3>Transcript</h3>
      {turns.length === 0 ? <p>No turns yet.</p> : null}
      <ul>
        {turns.map((turn) => (
          <li key={turn.id} className={turn.role === "user" ? "turn user" : "turn assistant"}>
            <span className="role">{turn.role.toUpperCase()}</span>
            <p>{turn.content}</p>
            <small>{new Date(turn.createdAt).toLocaleString()}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

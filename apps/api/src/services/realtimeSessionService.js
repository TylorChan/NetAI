const OPENAI_REALTIME_URL = "https://api.openai.com/v1/realtime/client_secrets";

class RealtimeSessionError extends Error {
  constructor(message, status = 500, details = "") {
    super(message);
    this.name = "RealtimeSessionError";
    this.status = status;
    this.details = details;
  }
}

export async function createRealtimeSession({
  openAiApiKey,
  model = "gpt-realtime",
  voice = "alloy"
}) {
  if (!openAiApiKey) {
    throw new RealtimeSessionError("OPENAI_API_KEY is required", 500);
  }

  const payload = {
    session: {
      type: "realtime",
      model,
      tool_choice: "auto",
      truncation: "auto",
      audio: {
        output: {
          voice
        }
      }
    }
  };

  const response = await fetch(OPENAI_REALTIME_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new RealtimeSessionError(
      "Realtime session creation failed",
      response.status,
      text
    );
  }

  return response.json();
}

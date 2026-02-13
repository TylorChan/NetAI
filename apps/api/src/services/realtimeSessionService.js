const OPENAI_REALTIME_URL = "https://api.openai.com/v1/realtime/client_secrets";

export async function createRealtimeSession({
  openAiApiKey,
  model = "gpt-realtime",
  voice = "alloy"
}) {
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  const response = await fetch(OPENAI_REALTIME_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model,
        voice,
        tool_choice: "auto",
        truncation: "auto"
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Realtime session creation failed (${response.status}): ${text}`);
  }

  return response.json();
}

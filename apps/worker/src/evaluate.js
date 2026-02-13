async function openAiEvaluate({ session, turns, apiKey }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5-mini-2025-08-07",
      input: [
        {
          role: "system",
          content:
            "You are a strict networking coach. Return only JSON that matches the schema: score(1-10), strengths[], improvements[], nextActions[], followUpEmail(string)."
        },
        {
          role: "user",
          content: JSON.stringify({
            session,
            turns
          })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "session_eval",
          strict: true,
          schema: {
            type: "object",
            properties: {
              score: { type: "integer", minimum: 1, maximum: 10 },
              strengths: { type: "array", items: { type: "string" } },
              improvements: { type: "array", items: { type: "string" } },
              nextActions: { type: "array", items: { type: "string" } },
              followUpEmail: { type: "string" }
            },
            required: ["score", "strengths", "improvements", "nextActions", "followUpEmail"],
            additionalProperties: false
          }
        }
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI evaluate failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return JSON.parse(data.output_text);
}

export async function evaluateConversation({ session, turns, apiKey }) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required in worker");
  }

  return openAiEvaluate({ session, turns, apiKey });
}

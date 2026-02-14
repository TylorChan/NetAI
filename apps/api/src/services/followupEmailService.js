function tonePrefix(tone) {
  const normalized = (tone || "professional").toLowerCase();
  if (normalized === "friendly") return "Great chatting today";
  if (normalized === "formal") return "Thank you for your time";
  return "Thanks for the conversation";
}

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

function redactInternalIds(text) {
  const raw = String(text || "");
  if (!raw.trim()) return "";

  // Remove UUID-like tokens and other internal identifiers that should never
  // appear in a user-facing email.
  const withoutUuids = raw.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    ""
  );

  return withoutUuids.replace(/[ \t]{2,}/g, " ").trim();
}

function readResponseText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload?.output)) {
    return "";
  }

  const chunks = [];
  for (const item of payload.output) {
    if (!Array.isArray(item?.content)) {
      continue;
    }
    for (const content of item.content) {
      if (typeof content?.text === "string" && content.text.trim()) {
        chunks.push(content.text.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

function formatFullTranscript(turns) {
  return (turns || [])
    .map((turn, index) => {
      const role = String(turn.role || "user").toUpperCase();
      const content = String(turn.content || "").trim();
      return `${index + 1}. [${role}] ${content}`;
    })
    .join("\n\n");
}

function lengthRule(length) {
  const normalized = String(length || "medium").toLowerCase();
  if (normalized === "short") {
    return "60-90 words";
  }
  if (normalized === "long") {
    return "120-160 words";
  }
  return "90-130 words";
}

async function generateWithModel({
  openAiApiKey,
  model,
  senderName,
  senderEmail,
  session,
  evaluation,
  turns,
  tone,
  length
}) {
  if (!openAiApiKey) {
    return null;
  }

  const transcript = formatFullTranscript(turns);
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model || "gpt-5.2",
      max_output_tokens: 520,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "You write high-quality follow-up emails for real networking contacts.",
                "The sender is the user. The recipient is the real-world target person they practiced talking to.",
                "Write naturally, concise, specific to their conversation, and relationship-aware.",
                "Keep it skimmable: 2 short paragraphs + sign-off.",
                "Send-within-24h vibe: grateful, specific, and clear next step.",
                "Never mention AI, simulation, role-play, transcript, or evaluation score.",
                "Never invent facts not supported by goal/context/transcript.",
                "Never include any internal IDs/UUIDs, session IDs, or database identifiers.",
                "If a name is not explicitly provided, use a neutral greeting like 'Hi,'.",
                "Output strictly two fields in plain text:",
                "Subject: ...",
                "Body: ..."
              ].join(" ")
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `Sender name: ${senderName}`,
                `Sender email (do not include unless asked): ${senderEmail || "Not provided"}`,
                `Networking goal: ${session.goal}`,
                `Target person context: ${session.targetProfileContext || "Not provided"}`,
                `Practice intent: ${session.customContext || "Not provided"}`,
                `Tone: ${tone}`,
                `Length: ${length}`,
                `Body length target: ${lengthRule(length)}`,
                `Internal coaching focus (do not mention directly): ${evaluation?.nextActions?.[0] || "N/A"}`,
                "Full transcript:",
                transcript || "No transcript available",
                "",
                "Rules:",
                "- Subject must be specific and not generic (no 'Follow-up from our chat').",
                "- Subject should hint utility or a memorable detail from the conversation.",
                "- Body must sound like the user writing to this real person.",
                "- Mention 1-2 concrete details from the conversation (no more).",
                "- Include one clear call-to-action question (easy to answer).",
                "- Put the ask in the second paragraph (not buried).",
                "- End with a natural sign-off and sender name only.",
                "- Do not use placeholders or brackets.",
                "- Do not include any IDs/UUID-like strings even if present above."
              ].join("\n")
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const text = readResponseText(payload);
  if (!text) {
    return null;
  }

  const subjectMatch = text.match(/Subject:\s*(.+)/i);
  const bodyMatch = text.match(/Body:\s*([\s\S]+)/i);
  if (!subjectMatch?.[1] || !bodyMatch?.[1]) {
    return null;
  }

  return {
    subject: redactInternalIds(subjectMatch[1]),
    body: redactInternalIds(bodyMatch[1])
  };
}

export function createFollowupEmailService({ store, openAiApiKey, model = "gpt-5.2" }) {
  return {
    async generate({ sessionId, tone = "professional", length = "medium" }) {
      const session = await store.getSession(sessionId);
      if (!session) {
        throw new Error("session not found");
      }

      const userRow = await store.getUserById(session.userId);
      const senderName = String(userRow?.name || "").trim() || "There";
      const senderEmail = String(userRow?.email || "").trim();
      const evaluation = await store.getEvaluation(sessionId);
      const turns = await store.getTurns(sessionId);

      const generated = await generateWithModel({
        openAiApiKey,
        model,
        senderName,
        senderEmail,
        session,
        evaluation,
        turns,
        tone,
        length
      });
      if (generated) {
        await store.saveFollowupEmailDraft({
          sessionId,
          subject: generated.subject,
          body: generated.body
        });
        return generated;
      }

      const prefix = tonePrefix(tone);
      const shortBody = `${prefix}. I appreciated your insights on ${session.goal}. If you are open to it, I would value one concrete suggestion on how to improve my networking conversations.`;
      const mediumBody = `${prefix}. I really appreciated your insights on ${session.goal}. I especially found your perspective on collaboration and career growth helpful. If you have time, I would value one practical suggestion on how I can improve my networking conversations and follow-ups.`;
      const longBody = `${prefix}. Thank you again for sharing your time and advice on ${session.goal}. I learned a lot from your perspective, especially around how to ask clearer questions and connect my project experience to business outcomes. I am actively practicing and would greatly appreciate one additional suggestion on what to focus on next. If it is helpful, I can also share a brief summary of how I apply your advice in my next conversation.`;

      const body = length === "short" ? shortBody : length === "long" ? longBody : mediumBody;
      const withFeedback = body;

      const fallback = {
        subject: `Quick follow-up on ${session.goal}`,
        body: `Hi,\n\n${withFeedback}\n\nBest regards,\n${senderName}`
      };

      await store.saveFollowupEmailDraft({
        sessionId,
        subject: fallback.subject,
        body: fallback.body
      });

      return fallback;
    }
  };
}

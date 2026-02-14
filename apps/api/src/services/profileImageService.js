const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

function readResponseText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload?.output)) {
    return "";
  }

  const chunks = [];
  for (const item of payload.output) {
    if (!Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      if (typeof content?.text === "string" && content.text.trim()) {
        chunks.push(content.text.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

function extractJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    // Best-effort: pull the first JSON object from the model output.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function stripCodeFences(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  return raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function safeTruncateAtBoundary(text, maxChars) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (raw.length <= maxChars) return raw;

  const clipped = raw.slice(0, maxChars);

  // Prefer cutting at a clean boundary near the end so we don't leave a partial sentence.
  const tailWindow = 260;
  const tail = clipped.slice(Math.max(0, clipped.length - tailWindow));
  const boundaryCandidates = [
    tail.lastIndexOf("\n\n"),
    tail.lastIndexOf("\n"),
    tail.lastIndexOf("."),
    tail.lastIndexOf("!"),
    tail.lastIndexOf("?")
  ]
    .map((idx) => (idx >= 0 ? idx : -1))
    .sort((a, b) => b - a);

  const best = boundaryCandidates.find((idx) => idx >= 0);
  if (typeof best === "number" && best >= 0) {
    const cutAt = clipped.length - tail.length + best + 1;
    const trimmed = clipped.slice(0, cutAt).trim();
    // Avoid cutting too aggressively (keep at least 65% of the budget).
    if (trimmed.length >= Math.floor(maxChars * 0.65)) {
      return trimmed;
    }
  }

  return clipped.trim();
}

function sanitizeProfileContext(text, maxChars = 1600) {
  const raw = stripCodeFences(text);
  if (!raw) return "";

  const compact = raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return safeTruncateAtBoundary(compact, maxChars);
}

function buildPrompt() {
  return [
    "You are extracting a compact target-person profile from screenshots.",
    "The screenshots are of a LinkedIn profile page and may contain noise (menus, buttons, ads, sidebars).",
    "Focus only on useful information that helps a realistic networking conversation.",
    "",
    "Extract only what is visible in the images. Do not guess missing facts.",
    "Prefer concise, high-signal bullets. Avoid filler and generic advice.",
    "If only partial sections are visible (e.g., Education, Projects), extract those anyway.",
    "",
    "Write the target profile in this exact plain-text template (omit lines that are not visible):",
    "Name: ...",
    "Headline: ...",
    "Current: ...",
    "Background:",
    "- ...",
    "- ...",
    "Keywords: k1, k2, k3",
    "Hooks:",
    "- ...?",
    "- ...?",
    "- ...?",
    "",
    "Hard rules:",
    "- Ignore irrelevant UI text.",
    "- No disclaimers, no 'I cannot', no repetition.",
    "- Keep under 1,600 characters.",
    "- Do not return an empty targetProfileContext.",
    "- End with a complete line. Do not truncate mid-sentence.",
    "",
    "Return only JSON:",
    "{\"targetProfileContext\":\"...\"}"
  ].join("\n");
}

function guessMimeType(file) {
  const type = String(file?.mimetype || "").toLowerCase();
  if (type.includes("png")) return "image/png";
  if (type.includes("webp")) return "image/webp";
  if (type.includes("gif")) return "image/gif";
  return "image/jpeg";
}

export function createProfileImageService({ openAiApiKey, model, logger }) {
  async function invokeModel({ modelName, content }) {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelName,
        max_output_tokens: 720,
        input: [
          {
            role: "user",
            content
          }
        ]
      })
    });

    const rawText = await response.text();
    if (!response.ok) {
      logger?.warn("profile image parse failed", {
        model: modelName,
        status: response.status,
        body: rawText.slice(0, 800)
      });
      const error = new Error("Failed to parse profile image");
      error.status = 502;
      throw error;
    }

    let payload = {};
    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch {
      const error = new Error("Malformed response from model");
      error.status = 502;
      throw error;
    }

    const outputText = readResponseText(payload);
    const parsed = extractJson(outputText);
    const fromJson = String(parsed?.targetProfileContext || "").trim();
    const fromText = sanitizeProfileContext(outputText);
    const targetProfileContext = sanitizeProfileContext(fromJson || fromText);

    return {
      outputTextLength: String(outputText || "").length,
      targetProfileContext
    };
  }

  return {
    async targetProfileFromImages(files) {
      if (!openAiApiKey) {
        throw new Error("OPENAI_API_KEY is missing");
      }

      const images = Array.isArray(files) ? files.filter(Boolean) : [];
      if (!images.length) {
        const error = new Error("No images provided");
        error.status = 400;
        throw error;
      }

      const content = [
        { type: "input_text", text: buildPrompt() },
        ...images.map((file) => {
          const mime = guessMimeType(file);
          const base64 = Buffer.from(file.buffer).toString("base64");
          return {
            type: "input_image",
            image_url: `data:${mime};base64,${base64}`
          };
        })
      ];

      const primaryModel = model || "gpt-5-mini";
      const candidates = [primaryModel, "gpt-5.2"].filter(
        (value, index, all) => all.indexOf(value) === index
      );

      let last = null;
      for (const candidate of candidates) {
        const result = await invokeModel({ modelName: candidate, content });
        last = result;
        if (result.targetProfileContext) {
          logger?.info("profile image imported", {
            model: candidate,
            images: images.length,
            outputTextLength: result.outputTextLength
          });
          return result.targetProfileContext;
        }
      }

      logger?.warn("profile image yielded empty output", {
        modelsTried: candidates,
        images: images.length,
        outputTextLength: last?.outputTextLength || 0
      });

      const error = new Error(
        "No profile context detected in image. Upload a clearer screenshot showing headline + experience."
      );
      error.status = 422;
      throw error;
    }
  };
}

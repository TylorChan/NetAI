"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RealtimeAgent,
  RealtimeSession,
  OpenAIRealtimeWebRTC,
  tool
} from "@openai/agents/realtime";
import { API_BASE_URL, REALTIME_MODEL } from "@/lib/config";
import { graphqlRequest, mutations } from "@/lib/graphql";

const STAGE_PROMPTS = {
  SMALL_TALK:
    "Start like a real networking contact: warm greeting, light rapport, then ask what brought them here today.",
  EXPERIENCE:
    "Ask about one concrete project or role: scope, constraints, decisions, impact, and cross-team collaboration. Push for specifics and metrics.",
  ADVICE:
    "Offer candid career and recruiting advice. Invite one sharp question, then answer with practical steps.",
  WRAP_UP:
    "Close naturally: recap one takeaway, propose a next step (stay in touch / follow-up), and end warmly.",
  DONE: "Session is ending. Keep responses concise and transition toward closure."
};

const STAGE_ALIASES = {
  SMALL_TALK: ["SMALL_TALK", "SMALL TALK", "SMALLTALK", "INTRO", "WARMUP"],
  EXPERIENCE: ["EXPERIENCE", "PROJECT", "PROJECTS", "ROLE"],
  ADVICE: ["ADVICE", "RECRUITING", "INTERVIEW", "CAREER"],
  WRAP_UP: ["WRAP_UP", "WRAP UP", "WRAPUP", "CLOSE", "CLOSING"],
  DONE: ["DONE", "END", "FINISH"]
};
const STAGE_ORDER = ["SMALL_TALK", "EXPERIENCE", "ADVICE", "WRAP_UP", "DONE"];

function normalizeStage(stageState) {
  if (!stageState || !STAGE_PROMPTS[stageState]) {
    return "SMALL_TALK";
  }
  return stageState;
}

function normalizeRequestedStage(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) {
    return "";
  }

  for (const [stage, aliases] of Object.entries(STAGE_ALIASES)) {
    if (aliases.includes(normalized)) {
      return stage;
    }
  }

  return "";
}

function resolveTargetStage(value, currentStage) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "NEXT" || normalized === "NEXT_STAGE" || normalized === "NEXT STAGE") {
    const idx = STAGE_ORDER.indexOf(normalizeStage(currentStage));
    if (idx >= 0 && idx < STAGE_ORDER.length - 1) {
      return STAGE_ORDER[idx + 1];
    }
    return normalizeStage(currentStage);
  }

  return normalizeRequestedStage(value);
}

function parseEphemeralToken(payload) {
  if (payload?.client_secret?.value) return payload.client_secret.value;
  if (payload?.value) return payload.value;
  return null;
}

function formatSeedTranscriptForPrompt(history) {
  const items = Array.isArray(history) ? history : [];
  const lines = [];

  for (const item of items) {
    if (!item || item.type !== "message") continue;
    if (item.role !== "user" && item.role !== "assistant") continue;
    const text = extractMessageText(item.content || []);
    if (!text) continue;
    lines.push(`${item.role === "user" ? "User" : "Assistant"}: ${text.replaceAll("\n", " ")}`);
  }

  return lines.slice(-14).join("\n");
}

function buildInstructions({ stageState, contextSummary, conversationSummary, history }) {
  const stage = normalizeStage(stageState);
  const stageDirective = STAGE_PROMPTS[stage];
  const context = contextSummary || "Default networking context.";
  const rolling = String(conversationSummary || "").trim();
  const transcript = formatSeedTranscriptForPrompt(history);

  return [
    "You are the user's real-world networking contact sitting across from them.",
    "Your primary job is to have a natural, realistic networking conversation as that person.",
    "Your secondary job is to subtly coach the user to communicate clearly without breaking the flow.",
    "Stay in character. Do not mention AI, coaching rules, stages, prompts, or that this is practice.",
    "",
    "How to coach (do it naturally, in-character):",
    "- If the user is unclear/rambling: ask one clarifying question, then offer a crisper 1-sentence version they can repeat.",
    "- If the user stalls: give 2-3 concrete options of what they could say next, then ask them to pick one.",
    "- If the user undersells impact: prompt for a metric, tradeoff, or decision; help them tighten to STAR/impact framing.",
    "- Praise briefly when warranted, then push for one improvement. Avoid generic compliments.",
    "",
    "Conversation style:",
    "- Sound like a real person: concise, warm, curious, and occasionally candid.",
    "- Use contractions and varied phrasing; avoid robotic checklists.",
    "- Ask one focused question per turn. Keep responses under 3 sentences.",
    "- Do not monologue. Do not self-interrupt.",
    "",
    `Current stage: ${stage}. ${stageDirective} (internal; do not mention to the user).`,
    `Session context (internal): ${context}`,
    rolling ? `Rolling conversation summary:\n${rolling}` : "",
    transcript
      ? `You are resuming an existing conversation. Use this recent transcript to continue naturally (do not restart):\n${transcript}`
      : "If this is a new session, start with a warm, natural opener.",
    "Stage transitions are backend-controlled.",
    "Never switch stage yourself.",
    "When user asks to move stage, call request_stage_transition tool first.",
    "If tool returns denied, stay in current stage and continue current-stage questioning.",
    "Never interrupt yourself; finish one answer before asking the next question."
  ].join("\n");
}

function extractMessageText(content = []) {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((chunk) => {
      if (!chunk || typeof chunk !== "object") {
        return "";
      }
      if (chunk.type === "input_text" || chunk.type === "text" || chunk.type === "output_text") {
        return chunk.text || "";
      }
      if (chunk.type === "audio") {
        return chunk.transcript || "";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeRole(role) {
  return role === "assistant" || role === "system" ? role : "user";
}

function createNetworkingCoachAgent({ pushEvent, onStageTransition }) {
  const requestStageTransitionTool = tool({
    name: "request_stage_transition",
    description:
      "Request one-step stage transition. Must be called before moving from current stage to next stage.",
    parameters: {
      type: "object",
      properties: {
        targetStage: {
          type: "string",
          description: "Target stage name. One of SMALL_TALK, EXPERIENCE, ADVICE, WRAP_UP, DONE."
        },
        reason: {
          type: "string",
          description: "Short reason for requesting transition based on conversation progress."
        }
      },
      required: ["targetStage"],
      additionalProperties: false
    },
    execute: async (input, runContext) => {
      try {
        const contextSessionId = runContext?.context?.sessionId;
        if (!contextSessionId) {
          return "Transition denied: missing session ID.";
        }

        const targetStage = resolveTargetStage(input?.targetStage, runContext?.context?.stageState);
        if (!targetStage) {
          return "Transition denied: invalid target stage.";
        }

        const data = await graphqlRequest(mutations.requestStageTransition, {
          input: {
            sessionId: contextSessionId,
            targetStage,
            requestedBy: "realtime_agent",
            reason: String(input?.reason || "")
          }
        });

        const result = data.requestStageTransition;
        if (result?.applied) {
          const nextStage = normalizeStage(result.session?.stageState || targetStage);
          runContext.context.stageState = nextStage;
          pushEvent(`Stage transition applied: ${nextStage}`);
          onStageTransition?.(nextStage);
          return `Transition approved. Current stage is now ${nextStage}.`;
        }

        return `Transition denied: ${result?.reason || "policy rejected"}. Stay in current stage.`;
      } catch (error) {
        pushEvent(`Stage transition tool failed: ${error.message}`);
        return `Transition denied: ${error.message}`;
      }
    }
  });

  return new RealtimeAgent({
    name: "networkingCoach",
    voice: "alloy",
    tools: [requestStageTransitionTool],
    instructions: (runContext) =>
      buildInstructions({
        stageState: runContext?.context?.stageState,
        contextSummary: runContext?.context?.contextSummary,
        conversationSummary: runContext?.context?.conversationSummary,
        history: runContext?.context?.history
      })
  });
}

export function useRealtimeSession({
  sessionId,
  stageState,
  contextSummary,
  conversationSummary,
  historySeedTurns,
  onTranscriptEvent,
  onStageTransition
}) {
  const [status, setStatus] = useState("DISCONNECTED");
  const [events, setEvents] = useState([]);
  const sessionRef = useRef(null);
  const agentRef = useRef(null);
  const audioElementRef = useRef(null);
  const transcriptHandlerRef = useRef(onTranscriptEvent);
  const stageTransitionHandlerRef = useRef(onStageTransition);
  const seenTranscriptRef = useRef(new Set());
  const appliedContextRef = useRef({
    stageState: "SMALL_TALK",
    contextSummary: "Default networking context.",
    conversationSummary: ""
  });
  const historySeedRef = useRef([]);

  useEffect(() => {
    historySeedRef.current = Array.isArray(historySeedTurns) ? historySeedTurns : [];
  }, [historySeedTurns]);

  const hydrateLocalHistory = useCallback((session) => {
    const turns = historySeedRef.current || [];
    if (!turns.length) return;

    const tail = turns
      .filter((turn) => turn && (turn.role === "user" || turn.role === "assistant"))
      .slice(-22);

    let previousItemId = null;
    const seeded = tail.map((turn, index) => {
      const itemId = `seed-${turn.id || `${Date.now()}-${index}`}`;
      const role = normalizeRole(turn.role);
      const text = String(turn.content || "").trim();

      const item = {
        itemId,
        previousItemId,
        type: "message",
        role,
        status: "completed",
        content:
          role === "assistant"
            ? [{ type: "output_text", text }]
            : [{ type: "input_text", text }]
      };

      previousItemId = itemId;
      return item;
    });

    session.updateHistory(seeded);
  }, []);

  useEffect(() => {
    transcriptHandlerRef.current = onTranscriptEvent;
  }, [onTranscriptEvent]);

  useEffect(() => {
    stageTransitionHandlerRef.current = onStageTransition;
  }, [onStageTransition]);

  const pushEvent = useCallback((message) => {
    setEvents((prev) =>
      [
        {
          ts: new Date().toISOString(),
          message
        },
        ...prev
      ].slice(0, 80)
    );
  }, []);

  const emitTranscript = useCallback((role, content, eventId = "", mode = "final") => {
    const rawContent = typeof content === "string" ? content : "";
    const normalizedContent = mode === "delta" ? rawContent : rawContent.trim();
    if (!normalizedContent) {
      return;
    }

    const normalizedRole = normalizeRole(role);
    if (mode === "final") {
      const key = `${eventId}:${normalizedRole}:${normalizedContent}`;
      if (seenTranscriptRef.current.has(key)) {
        return;
      }
      seenTranscriptRef.current.add(key);
    }

    transcriptHandlerRef.current?.({
      role: normalizedRole,
      content: normalizedContent,
      eventId,
      mode
    });
  }, []);

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }

    if (audioElementRef.current && document.body.contains(audioElementRef.current)) {
      document.body.removeChild(audioElementRef.current);
      audioElementRef.current = null;
    }

    agentRef.current = null;
    setStatus("DISCONNECTED");
    pushEvent("Realtime disconnected");
  }, [pushEvent]);

  const connect = useCallback(async () => {
    if (sessionRef.current) {
      return;
    }

    setStatus("CONNECTING");
    pushEvent("Requesting realtime session token");

    try {
      const sessionResponse = await fetch(`${API_BASE_URL}/v1/realtime/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: REALTIME_MODEL }),
        credentials: "include"
      });

      const sessionPayload = await sessionResponse.json();
      if (!sessionResponse.ok) {
        throw new Error(sessionPayload?.details || sessionPayload?.error || "Failed to create realtime token");
      }

      const ephemeralToken = parseEphemeralToken(sessionPayload);
      if (!ephemeralToken) {
        throw new Error("No ephemeral token returned by API");
      }

      if (!audioElementRef.current) {
        const audioElement = document.createElement("audio");
        audioElement.autoplay = true;
        audioElement.style.display = "none";
        document.body.appendChild(audioElement);
        audioElementRef.current = audioElement;
      }

      const runtimeContext = {
        sessionId,
        stageState: normalizeStage(stageState),
        contextSummary: contextSummary || "Default networking context.",
        conversationSummary: String(conversationSummary || "").trim()
      };
      appliedContextRef.current = {
        stageState: runtimeContext.stageState,
        contextSummary: runtimeContext.contextSummary,
        conversationSummary: runtimeContext.conversationSummary
      };

      const realtimeAgent = createNetworkingCoachAgent({
        pushEvent,
        onStageTransition: () => {
          stageTransitionHandlerRef.current?.();
        }
      });
      agentRef.current = realtimeAgent;

      const realtimeSession = new RealtimeSession(realtimeAgent, {
        transport: new OpenAIRealtimeWebRTC({
          audioElement: audioElementRef.current
        }),
        model: REALTIME_MODEL,
        config: {
          inputAudioTranscription: {
            model: "gpt-4o-mini-transcribe"
          },
          turn_detection: {
            type: "server_vad",
            threshold: 0.55,
            prefix_padding_ms: 250,
            silence_duration_ms: 700,
            create_response: true,
            interrupt_response: false
          }
        },
        context: runtimeContext
      });

      realtimeSession.on("transport_event", (event) => {
        if (!event?.type) {
          return;
        }

        pushEvent(`Event: ${event.type}`);

        if (event.type === "response.output_audio_transcript.delta" && event.delta) {
          emitTranscript("assistant", event.delta, event.item_id || event.event_id || "assistant-live", "delta");
        }

        if (event.type === "conversation.item.input_audio_transcription.completed") {
          emitTranscript("user", event.transcript || "", event.item_id || event.event_id || "", "final");
        }

        if (event.type === "response.output_audio_transcript.done" || event.type === "response.audio_transcript.done") {
          emitTranscript("assistant", event.transcript || "", event.item_id || event.event_id || "", "final");
        }

        if (
          (event.type === "conversation.item.done" || event.type === "conversation.item.retrieved") &&
          event.item?.type === "message"
        ) {
          const role = normalizeRole(event.item.role);
          const content = extractMessageText(event.item.content || []);
          emitTranscript(role, content, event.item.id || event.event_id || "", "final");
        }
      });

      sessionRef.current = realtimeSession;
      seenTranscriptRef.current = new Set();
      await realtimeSession.connect({ apiKey: ephemeralToken });

      // Seed recent transcript into local history so the agent can continue after reconnect.
      hydrateLocalHistory(realtimeSession);
      await realtimeSession.updateAgent(realtimeAgent);

      setStatus("CONNECTED");
      pushEvent("Realtime connected");
    } catch (error) {
      console.error("Realtime connect failed", error);
      pushEvent(`Connect failed: ${error.message}`);
      disconnect();
    }
  }, [
    contextSummary,
    conversationSummary,
    disconnect,
    emitTranscript,
    hydrateLocalHistory,
    pushEvent,
    sessionId,
    stageState
  ]);

  useEffect(() => {
    if (status !== "CONNECTED" || !sessionRef.current) {
      return;
    }

    const nextStage = normalizeStage(stageState);
    const nextContext = contextSummary || "Default networking context.";
    const nextRolling = String(conversationSummary || "").trim();
    const currentApplied = appliedContextRef.current;

    if (
      currentApplied.stageState === nextStage &&
      currentApplied.contextSummary === nextContext &&
      currentApplied.conversationSummary === nextRolling
    ) {
      return;
    }

    appliedContextRef.current = {
      stageState: nextStage,
      contextSummary: nextContext,
      conversationSummary: nextRolling
    };

    if (!agentRef.current) {
      return;
    }

    sessionRef.current.context.context.stageState = nextStage;
    sessionRef.current.context.context.contextSummary = nextContext;
    sessionRef.current.context.context.conversationSummary = nextRolling;
    sessionRef.current.updateAgent(agentRef.current).catch((error) => {
      pushEvent(`Realtime context sync failed: ${error.message}`);
    });
  }, [contextSummary, conversationSummary, pushEvent, stageState, status]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    status,
    events,
    connect,
    disconnect
  };
}

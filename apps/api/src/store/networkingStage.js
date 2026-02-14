const STAGE_SEQUENCE = ["SMALL_TALK", "EXPERIENCE", "ADVICE", "WRAP_UP", "DONE"];

// Hybrid policy: completion gates + time/turn fallbacks (deterministic).
const STAGE_POLICY = {
  SMALL_TALK: {
    minUserTurns: 2,
    // Keep some rapport; avoid instant jumps.
    minSecondsBeforeAdvance: 60,
    timeFallbackSeconds: 120,
    // If user explicitly requests advancing, still require a minimum to avoid instant skipping.
    requestMinUserTurns: 2,
    requestMinSecondsBeforeAdvance: 60,
    requestTimeFallbackSeconds: 90,
    maxUserTurnsFallback: 5
  },
  EXPERIENCE: {
    minUserTurns: 4,
    // Deep dive is the core of a 15-min practice.
    minSecondsBeforeAdvance: 240,
    timeFallbackSeconds: 7 * 60,
    maxUserTurnsFallback: 12,
    requestMinUserTurns: 3,
    requestMinSecondsBeforeAdvance: 180,
    requestTimeFallbackSeconds: 5 * 60
  },
  ADVICE: {
    minUserTurns: 2,
    minSecondsBeforeAdvance: 150,
    timeFallbackSeconds: 3 * 60,
    maxUserTurnsFallback: 6,
    requestMinUserTurns: 2,
    requestMinSecondsBeforeAdvance: 120,
    requestTimeFallbackSeconds: 2 * 60
  },
  WRAP_UP: {
    minUserTurns: 1,
    minSecondsBeforeAdvance: 90,
    timeFallbackSeconds: 2 * 60,
    maxUserTurnsFallback: 3,
    requestMinUserTurns: 1,
    requestMinSecondsBeforeAdvance: 60,
    requestTimeFallbackSeconds: 60
  }
};

const INTRO_OR_CONTEXT_PATTERNS = [
  /\b(i am|i'm)\s+(a|an|the)\b/i,
  /\b(i am|i'm)\s+(currently|recently)\b/i,
  /\b(currently|recently)\b/i,
  /\b(study|student|intern|engineer|manager)\b/i,
  /\bmy background\b/i,
  /我(是|现在|目前|最近)/,
  /我是/,
  /最近在/
];

const PROJECT_OR_ROLE_PATTERNS = [
  /\b(project|team|role|company|collaborat|scope)\b/i,
  /项目/,
  /团队/,
  /岗位/,
  /公司/,
  /工作内容/
];

const EXPERIENCE_SPECIFICITY_PATTERNS = [
  /\b\d+(\.\d+)?(%|ms|s|sec|minutes|min|hrs|hours|k|m)?\b/i,
  /\b(metric|impact|improv|increase|reduce|latency|throughput|cost|scale|scalability)\b/i,
  /\b(trade-?off|constraint|decision|risk)\b/i,
  /\b(i (owned|led|built|implemented|designed|shipped))\b/i,
  /指标|提升|优化|降低|权衡|取舍|限制|决定|我(负责|主导|实现|设计|上线)/
];

const ADVICE_REQUEST_PATTERNS = [
  /\b(advice|recommend|suggest|tips?)\b/i,
  /\b(recruit|recruiting|interview|job search)\b/i,
  /你建议/,
  /有什么建议/,
  /怎么(做|准备|提升)/,
  /可以推荐/
];

const WRAPUP_PATTERNS = [
  /\b(thank|thanks|appreciate)\b/i,
  /\b(follow[- ]?up|email|connect|stay in touch|next step)\b/i,
  /谢谢|感谢/,
  /回头.*(邮件|email)/,
  /保持联系/
];

const FORCE_NEXT_PATTERNS = [
  /\bnext stage\b/i,
  /\bmove (to )?next\b/i,
  /\blet'?s move on\b/i,
  /\badvance\b/i,
  /\bgo on to\b/i,
  /\bskip ahead\b/i
];

const FORCE_TARGET_STAGE_PATTERNS = [
  {
    stage: "EXPERIENCE",
    patterns: [/\bexperience\b/i, /\bproject experience\b/i, /\bwork experience\b/i]
  },
  {
    stage: "ADVICE",
    patterns: [/\badvice\b/i, /\brecruit(ing)?\b/i, /\binterview\b/i, /\bcareer guidance\b/i]
  },
  {
    stage: "WRAP_UP",
    patterns: [/\bwrap ?up\b/i, /\bclosing\b/i, /\bfinal part\b/i]
  },
  {
    stage: "DONE",
    patterns: [/\bdone\b/i, /\bfinish(ed)?\b/i, /\bend this\b/i]
  }
];

const STAGE_HINTS = {
  SMALL_TALK: "Start with warm opening, light context, and one tailored question.",
  EXPERIENCE: "Explore role scope, projects, cross-team work, and industry insights.",
  ADVICE: "Ask for recruiting advice, skill gaps, and interview preparation strategies.",
  WRAP_UP: "Close gracefully, confirm one next action, and prepare follow-up note.",
  DONE: "Session reached closing stage. Finalize when ready for evaluation."
};

const STAGE_ALIASES = {
  SMALL_TALK: ["SMALL_TALK", "SMALL TALK", "SMALLTALK", "INTRO", "WARMUP"],
  EXPERIENCE: ["EXPERIENCE", "PROJECTS", "PROJECT", "ROLE"],
  ADVICE: ["ADVICE", "RECRUITING", "INTERVIEW", "CAREER"],
  WRAP_UP: ["WRAP_UP", "WRAP UP", "CLOSE", "CLOSING", "OUTRO"],
  DONE: ["DONE", "END", "FINISH"]
};

export function normalizeStage(stage) {
  if (!stage || !STAGE_SEQUENCE.includes(stage)) {
    return STAGE_SEQUENCE[0];
  }

  return stage;
}

function nextStage(stage) {
  const normalized = normalizeStage(stage);
  const idx = STAGE_SEQUENCE.indexOf(normalized);
  if (idx < 0 || idx === STAGE_SEQUENCE.length - 1) {
    return "DONE";
  }

  return STAGE_SEQUENCE[idx + 1];
}

function anyPatternMatches(patterns, content) {
  if (!content) return false;
  return patterns.some((pattern) => pattern.test(content));
}

function findForcedTargetStage(content) {
  if (!content) {
    return null;
  }

  for (const entry of FORCE_TARGET_STAGE_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(content))) {
      return entry.stage;
    }
  }

  return null;
}

function shouldForceAdvance(content) {
  if (!content) {
    return false;
  }

  return FORCE_NEXT_PATTERNS.some((pattern) => pattern.test(content));
}

function stageIndex(stage) {
  return STAGE_SEQUENCE.indexOf(normalizeStage(stage));
}

export function normalizeRequestedStage(stage) {
  const normalized = String(stage || "").trim().toUpperCase();
  if (!normalized) {
    return "";
  }

  for (const canonical of STAGE_SEQUENCE) {
    const aliases = STAGE_ALIASES[canonical] || [];
    if (aliases.includes(normalized)) {
      return canonical;
    }
  }

  return "";
}

export function evaluateStageTransition({ currentStage, targetStage }) {
  const current = normalizeStage(currentStage);
  const requested = normalizeRequestedStage(targetStage);

  if (!requested) {
    return {
      applied: false,
      nextStage: current,
      reason: "Unknown target stage"
    };
  }

  const currentIdx = stageIndex(current);
  const targetIdx = stageIndex(requested);

  if (targetIdx <= currentIdx) {
    return {
      applied: false,
      nextStage: current,
      reason: "Target stage is not ahead of current stage"
    };
  }

  if (targetIdx > currentIdx + 1) {
    return {
      applied: false,
      nextStage: current,
      reason: "Only one-stage forward transition is allowed"
    };
  }

  return {
    applied: true,
    nextStage: requested,
    reason: `Transition approved: ${current} -> ${requested}`
  };
}

export function computeNextStage({ currentStage, userTurnCount, latestUserContent }) {
  const stage = normalizeStage(currentStage);
  if (stage === "DONE") {
    return stage;
  }

  const forcedTarget = findForcedTargetStage(latestUserContent);
  if (forcedTarget) {
    const currentIdx = stageIndex(stage);
    const targetIdx = stageIndex(forcedTarget);
    if (targetIdx > currentIdx) {
      return forcedTarget;
    }
  }

  if (shouldForceAdvance(latestUserContent)) {
    return nextStage(stage);
  }

  // Legacy fallback: keep stage unless forced.
  return stage;
}

export function getStageHint(stage) {
  return STAGE_HINTS[normalizeStage(stage)];
}

export function getStageSequence() {
  return [...STAGE_SEQUENCE];
}

export function updateStageSignals({ stage, flags, latestUserContent }) {
  const normalizedStage = normalizeStage(stage);
  const next = { ...(flags || {}) };
  const content = String(latestUserContent || "");

  if (normalizedStage === "SMALL_TALK") {
    if (!next.hasIntroOrContext && anyPatternMatches(INTRO_OR_CONTEXT_PATTERNS, content)) {
      next.hasIntroOrContext = true;
    }
    if (!next.hasProjectOrRole && anyPatternMatches(PROJECT_OR_ROLE_PATTERNS, content)) {
      next.hasProjectOrRole = true;
    }
  }

  if (normalizedStage === "EXPERIENCE") {
    if (!next.hasSpecificity && anyPatternMatches(EXPERIENCE_SPECIFICITY_PATTERNS, content)) {
      next.hasSpecificity = true;
    }
  }

  if (normalizedStage === "ADVICE") {
    if (!next.askedAdvice && (anyPatternMatches(ADVICE_REQUEST_PATTERNS, content) || content.includes("?") || content.includes("？"))) {
      next.askedAdvice = true;
    }
  }

  if (normalizedStage === "WRAP_UP") {
    if (!next.hasThanksFollowup && anyPatternMatches(WRAPUP_PATTERNS, content)) {
      next.hasThanksFollowup = true;
    }
  }

  return next;
}

function elapsedSeconds(sinceIso, now = Date.now()) {
  const since = sinceIso ? new Date(sinceIso).getTime() : 0;
  if (!Number.isFinite(since) || since <= 0) return 0;
  const diff = now - since;
  return diff > 0 ? Math.floor(diff / 1000) : 0;
}

export function shouldAdvanceStage({
  currentStage,
  stageEnteredAt,
  stageUserTurns,
  stageSignalFlags,
  latestUserContent,
  nowMs = Date.now(),
  isRequested = false
}) {
  const stage = normalizeStage(currentStage);
  if (stage === "DONE") {
    return { advance: false, nextStage: "DONE", reason: "Already done" };
  }

  const policy = STAGE_POLICY[stage];
  if (!policy) {
    return { advance: false, nextStage: stage, reason: "No policy" };
  }

  const turns = Number(stageUserTurns) || 0;
  const seconds = elapsedSeconds(stageEnteredAt, nowMs);
  const flags = stageSignalFlags || {};

  const minTurns = isRequested ? policy.requestMinUserTurns : policy.minUserTurns;
  const timeFallback = isRequested ? policy.requestTimeFallbackSeconds : policy.timeFallbackSeconds;
  const minSecondsBeforeAdvance = isRequested
    ? Number(policy.requestMinSecondsBeforeAdvance || 0)
    : Number(policy.minSecondsBeforeAdvance || 0);

  const timeOk = Number(timeFallback) > 0 && turns >= 1 && seconds >= timeFallback;
  const maxTurnsOk =
    Number(policy.maxUserTurnsFallback) > 0 && turns >= policy.maxUserTurnsFallback;

  let signalOk = false;
  if (stage === "SMALL_TALK") {
    signalOk = Boolean(flags.hasIntroOrContext || flags.hasProjectOrRole);
  } else if (stage === "EXPERIENCE") {
    signalOk = Boolean(flags.hasSpecificity);
  } else if (stage === "ADVICE") {
    signalOk = Boolean(flags.askedAdvice);
  } else if (stage === "WRAP_UP") {
    signalOk = Boolean(flags.hasThanksFollowup);
  }

  const completionOk = turns >= minTurns && signalOk && seconds >= minSecondsBeforeAdvance;
  const allow = completionOk || timeOk || maxTurnsOk;

  if (!allow) {
    const base =
      stage === "SMALL_TALK"
        ? "Keep it brief: share your quick background or ask about their team/project."
        : stage === "EXPERIENCE"
          ? "Add one concrete detail: metric, tradeoff, or what you owned."
          : stage === "ADVICE"
            ? "Ask one specific advice question."
            : "Thank them and propose a simple follow-up next step.";

    return {
      advance: false,
      nextStage: stage,
      reason: base
    };
  }

  // Prevent accidental skipping by content that tries to jump multiple stages.
  const forcedTarget = findForcedTargetStage(latestUserContent);
  if (forcedTarget) {
    const currentIdx = stageIndex(stage);
    const targetIdx = stageIndex(forcedTarget);
    if (targetIdx === currentIdx + 1) {
      return { advance: true, nextStage: forcedTarget, reason: "Forced target stage" };
    }
  }

  return { advance: true, nextStage: nextStage(stage), reason: "Policy satisfied" };
}

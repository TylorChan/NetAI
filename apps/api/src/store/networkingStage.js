const STAGE_SEQUENCE = ["SMALL_TALK", "EXPERIENCE", "ADVICE", "WRAP_UP", "DONE"];

const STAGE_THRESHOLD = {
  SMALL_TALK: 2,
  EXPERIENCE: 6,
  ADVICE: 9,
  WRAP_UP: 11
};

const STAGE_KEYWORDS = {
  SMALL_TALK: ["project", "team", "role", "company", "collaborate", "industry"],
  EXPERIENCE: ["advice", "skills", "recruit", "interview", "job search", "prepare"],
  ADVICE: ["follow up", "thank", "next step", "connect", "email", "appreciate"],
  WRAP_UP: ["bye", "goodbye", "talk soon", "see you", "thanks for your time"]
};

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

function isKeywordTriggered(stage, content) {
  const keywords = STAGE_KEYWORDS[stage];
  if (!keywords?.length || !content) {
    return false;
  }

  const normalizedContent = content.toLowerCase();
  return keywords.some((keyword) => normalizedContent.includes(keyword));
}

function isThresholdReached(stage, userTurnCount) {
  const threshold = STAGE_THRESHOLD[stage];
  if (!threshold) {
    return false;
  }

  return userTurnCount >= threshold;
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

  const shouldAdvance =
    isThresholdReached(stage, userTurnCount) ||
    isKeywordTriggered(stage, latestUserContent);

  if (!shouldAdvance) {
    return stage;
  }

  return nextStage(stage);
}

export function getStageHint(stage) {
  return STAGE_HINTS[normalizeStage(stage)];
}

export function getStageSequence() {
  return [...STAGE_SEQUENCE];
}

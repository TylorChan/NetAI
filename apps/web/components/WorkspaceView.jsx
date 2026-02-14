"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import AuthForm from "@/components/AuthForm";
import SessionComposer from "@/components/SessionComposer";
import TranscriptPanel from "@/components/TranscriptPanel";
import { graphqlRequest, mutations, queries } from "@/lib/graphql";
import { useRealtimeSession } from "@/features/voice/useRealtimeSession";
import { authMe } from "@/lib/auth";
import { authLogout } from "@/lib/auth";

const STAGE_SEQUENCE = ["SMALL_TALK", "EXPERIENCE", "ADVICE", "WRAP_UP", "DONE"];

const STAGE_SUGGESTIONS = {
  SMALL_TALK: [
    {
      id: "small-open",
      title: "Warm Opener",
      detail: "Open with day, weather, or event context in one natural sentence.",
      icon: "spark"
    },
    {
      id: "small-bridge",
      title: "Bridge Question",
      detail: "Ask one light question before moving into project or role topics.",
      icon: "chat"
    }
  ],
  EXPERIENCE: [
    {
      id: "exp-collab",
      title: "Cross-Team Scope",
      detail: "Ask how their team collaborates with product, design, and business groups.",
      icon: "network"
    },
    {
      id: "exp-impact",
      title: "Project Impact",
      detail: "Follow one project thread to concrete outcomes and tradeoffs.",
      icon: "target"
    }
  ],
  ADVICE: [
    {
      id: "adv-skills",
      title: "Top Skills",
      detail: "Ask which skills matter most for internship or new-grad recruiting.",
      icon: "star"
    },
    {
      id: "adv-interview",
      title: "Interview Signals",
      detail: "Ask what interview behavior separates strong candidates from average ones.",
      icon: "check"
    }
  ],
  WRAP_UP: [
    {
      id: "wrap-recap",
      title: "Recap Clearly",
      detail: "Summarize one useful takeaway and acknowledge their time.",
      icon: "note"
    },
    {
      id: "wrap-follow",
      title: "Follow-up Intent",
      detail: "Ask permission to send a short follow-up note with next actions.",
      icon: "mail"
    }
  ],
  DONE: [
    {
      id: "done-eval",
      title: "Review Score",
      detail: "Open the evaluation panel and review strengths and improvement priorities.",
      icon: "meter"
    },
    {
      id: "done-email",
      title: "Send Better Follow-up",
      detail: "Generate and refine follow-up email for your real networking conversation.",
      icon: "rocket"
    }
  ]
};

function TipIcon({ type }) {
  const commonProps = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true
  };

  switch (type) {
    case "chat":
      return (
        <svg {...commonProps}>
          <path d="M4 5h16v10H8l-4 4V5z" />
        </svg>
      );
    case "network":
      return (
        <svg {...commonProps}>
          <circle cx="5" cy="12" r="2.2" />
          <circle cx="12" cy="6" r="2.2" />
          <circle cx="19" cy="12" r="2.2" />
          <circle cx="12" cy="18" r="2.2" />
          <path d="M7 12h10M12 8.2v7.6" />
        </svg>
      );
    case "target":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="12" cy="12" r="1" />
        </svg>
      );
    case "star":
      return (
        <svg {...commonProps}>
          <path d="m12 3 2.8 5.6L21 9.4l-4.5 4.3L17.5 21 12 18l-5.5 3 1-7.3L3 9.4l6.2-.8Z" />
        </svg>
      );
    case "check":
      return (
        <svg {...commonProps}>
          <path d="m4 13 5 5L20 7" />
        </svg>
      );
    case "note":
      return (
        <svg {...commonProps}>
          <path d="M6 4h12v16H6z" />
          <path d="M9 9h6M9 13h6M9 17h4" />
        </svg>
      );
    case "mail":
      return (
        <svg {...commonProps}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="m4 8 8 6 8-6" />
        </svg>
      );
    case "meter":
      return (
        <svg {...commonProps}>
          <path d="M4 16a8 8 0 1 1 16 0" />
          <path d="M12 12 16 8" />
          <path d="M7 16h10" />
        </svg>
      );
    case "rocket":
      return (
        <svg {...commonProps}>
          <path d="M14 4c3 0 6 3 6 6-2 0-4.3.7-6 2.4C12.3 14.1 11.6 16.4 11.6 18.4c-3 0-6-3-6-6 2 0 4.3-.7 6-2.4C13.3 8.3 14 6 14 4Z" />
          <path d="M7 17 4 20M9 19l-2 2" />
        </svg>
      );
    case "spark":
    default:
      return (
        <svg {...commonProps}>
          <path d="m12 3 1.6 3.9L18 8.5l-3.3 2.8L15.6 16 12 13.8 8.4 16l.9-4.7L6 8.5l4.4-1.6Z" />
        </svg>
      );
  }
}

function normalizeRole(role) {
  return role === "assistant" || role === "system" ? role : "user";
}

function formatStage(stage) {
  return String(stage || "SMALL_TALK").replaceAll("_", " ");
}

function nowIso() {
  return new Date().toISOString();
}

function toMs(value) {
  return value ? new Date(value).getTime() : 0;
}

function sessionIdFromPath(pathname) {
  const match = String(pathname || "").match(/^\/session\/([^/]+)$/);
  return match?.[1] || null;
}

export default function WorkspaceView({ initialSessionId = null }) {
  const turnQueueRef = useRef(Promise.resolve());
  const finalTranscriptKeysRef = useRef(new Set());
  const newSessionTimerRef = useRef(null);
  const composerCloseTimerRef = useRef(null);
  const sessionLoaderTimerRef = useRef(null);
  const chatPrimaryRef = useRef(null);
  const scorePanelRef = useRef(null);
  const openedEvaluationKeyRef = useRef("");
  const evaluationCacheRef = useRef({});

  const [activeSessionId, setActiveSessionId] = useState(initialSessionId);
  const [authStatus, setAuthStatus] = useState("loading"); // loading | authed | none
  const [currentUser, setCurrentUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [resume, setResume] = useState(null);
  const [showSessionLoadingHint, setShowSessionLoadingHint] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [liveTurns, setLiveTurns] = useState({});
  const [followupEmail, setFollowupEmail] = useState(null);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [autoOpenEvalSessionId, setAutoOpenEvalSessionId] = useState(null);
  const [scoreExpanded, setScoreExpanded] = useState(false);
  const [showComposerOverlay, setShowComposerOverlay] = useState(false);
  const [composerOverlayPhase, setComposerOverlayPhase] = useState("closed");
  const [newSessionButtonFading, setNewSessionButtonFading] = useState(false);
  const [isResizingHeight, setIsResizingHeight] = useState(false);
  const [transcriptHeightPct, setTranscriptHeightPct] = useState(64);
  const [error, setError] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [openSessionMenuId, setOpenSessionMenuId] = useState(null);
  const [sessionMenuPos, setSessionMenuPos] = useState(null);
  const [sessionActionBusyId, setSessionActionBusyId] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userMenuPos, setUserMenuPos] = useState(null);

  const isAuthed = authStatus === "authed";
  const hasSelectedSession = isAuthed && Boolean(activeSessionId);
  const activeSessionReady = isAuthed && resume?.session?.id === activeSessionId;
  const isSessionLoading = hasSelectedSession && !activeSessionReady;
  const shouldShowSessionLoader = isSessionLoading && showSessionLoadingHint;

  const clearAuth = useCallback(() => {
    setAuthStatus("none");
    setCurrentUser(null);
    setSessions([]);
    setResume(null);
    setEvaluation(null);
    setFollowupEmail(null);
    setLiveTurns({});
    setShowComposerOverlay(false);
    setComposerOverlayPhase("closed");
  }, []);

  const loadSessions = useCallback(async () => {
    if (!isAuthed) {
      return;
    }

    setLoadingSessions(true);
    try {
      const data = await graphqlRequest(queries.sessions);
      setSessions(data.sessions || []);
    } catch (loadError) {
      if (loadError?.message === "UNAUTHENTICATED") {
        clearAuth();
        return;
      }
      throw loadError;
    } finally {
      setLoadingSessions(false);
    }
  }, [clearAuth, isAuthed]);

  const loadResume = useCallback(
    async (sessionId) => {
      if (!sessionId) {
        setResume(null);
        return;
      }

      try {
        const data = await graphqlRequest(queries.getSessionResume, { sessionId });
        setResume(data.getSessionResume);
      } catch (loadError) {
        if (loadError?.message === "UNAUTHENTICATED") {
          clearAuth();
          return;
        }
        throw loadError;
      }
    },
    [clearAuth]
  );

  const loadEvaluation = useCallback(async (sessionId) => {
    if (!sessionId) {
      setEvaluation(null);
      return;
    }

    try {
      const data = await graphqlRequest(queries.getSessionEvaluation, { sessionId });
      evaluationCacheRef.current[sessionId] = data.getSessionEvaluation;
      setEvaluation(data.getSessionEvaluation);
    } catch (loadError) {
      if (loadError?.message === "UNAUTHENTICATED") {
        clearAuth();
        return;
      }
      throw loadError;
    }
  }, [clearAuth]);

  const appendTurnLocal = useCallback((sessionId, role, content) => {
    setResume((prev) => {
      if (!prev?.session || prev.session.id !== sessionId) {
        return prev;
      }

      const ts = nowIso();
      const nextTurn = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        sessionId,
        role,
        content,
        createdAt: ts
      };

      return {
        ...prev,
        recentTurns: [...(prev.recentTurns || []), nextTurn].slice(-220),
        session: {
          ...prev.session,
          updatedAt: ts
        }
      };
    });
  }, []);

  const persistTurn = useCallback(async (sessionId, role, content) => {
    turnQueueRef.current = turnQueueRef.current
      .catch(() => {})
      .then(async () => {
        await graphqlRequest(mutations.appendSessionTurn, {
          input: {
            sessionId,
            role: normalizeRole(role),
            content
          }
        });
      });

    return turnQueueRef.current;
  }, []);

  const handleTranscriptEvent = useCallback(
    ({ role, content, eventId, mode }) => {
      if (!activeSessionId) {
        return;
      }

      const streamKey = eventId || `${role || "assistant"}-stream`;
      const normalizedRole = normalizeRole(role);
      const text = mode === "delta" ? String(content || "") : String(content || "").trim();
      if (!text) {
        return;
      }

      if (mode === "delta") {
        setLiveTurns((prev) => {
          const previous = prev[streamKey];
          return {
            ...prev,
            [streamKey]: {
              id: `live-${streamKey}`,
              sessionId: activeSessionId,
              role: normalizedRole,
              content: previous ? `${previous.content}${text}` : text,
              createdAt: nowIso()
            }
          };
        });
        return;
      }

      setLiveTurns((prev) => {
        if (!prev[streamKey]) {
          return prev;
        }
        const next = { ...prev };
        delete next[streamKey];
        return next;
      });

      const dedupeKey = `${activeSessionId}:${streamKey}:${normalizedRole}:${text}`;
      if (finalTranscriptKeysRef.current.has(dedupeKey)) {
        return;
      }
      finalTranscriptKeysRef.current.add(dedupeKey);

      appendTurnLocal(activeSessionId, normalizedRole, text);
      const persistPromise = persistTurn(activeSessionId, normalizedRole, text);
      persistPromise.catch((appendError) => {
        setError(appendError.message);
      });

      if (normalizedRole === "user") {
        persistPromise
          .then(() => loadResume(activeSessionId))
          .catch(() => {});
      }
    },
    [activeSessionId, appendTurnLocal, loadResume, persistTurn]
  );

  const { status: realtimeStatus, connect, disconnect } = useRealtimeSession({
    sessionId: activeSessionId,
    stageState: resume?.session?.stageState,
    goal: resume?.session?.goal,
    targetProfileContext: resume?.session?.targetProfileContext,
    customContext: resume?.session?.customContext,
    conversationSummary: resume?.conversationSummary,
    historySeedTurns: resume?.recentTurns,
    onTranscriptEvent: handleTranscriptEvent,
    onStageTransition: () => {
      if (activeSessionId) {
        loadResume(activeSessionId).catch(() => {});
      }
    }
  });

  useEffect(() => {
    document.body.classList.add("session-mode");
    return () => {
      document.body.classList.remove("session-mode");
      if (newSessionTimerRef.current) {
        clearTimeout(newSessionTimerRef.current);
      }
      if (composerCloseTimerRef.current) {
        clearTimeout(composerCloseTimerRef.current);
      }
      if (sessionLoaderTimerRef.current) {
        clearTimeout(sessionLoaderTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    authMe()
      .then((user) => {
        if (cancelled) return;
        if (user?.id) {
          setCurrentUser(user);
          setAuthStatus("authed");
          return;
        }
        setCurrentUser(null);
        setAuthStatus("none");
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentUser(null);
        setAuthStatus("none");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onPopState() {
      const sessionId = sessionIdFromPath(window.location.pathname);
      setActiveSessionId(sessionId);
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!isAuthed) {
      return;
    }

    loadSessions().catch((loadError) => setError(loadError.message));
  }, [isAuthed, loadSessions]);

  useEffect(() => {
    setShowEvaluationModal(false);
    setScoreExpanded(false);
    setFollowupEmail(null);
    setLiveTurns({});
    setShowSessionLoadingHint(false);
    finalTranscriptKeysRef.current = new Set();
    if (sessionLoaderTimerRef.current) {
      clearTimeout(sessionLoaderTimerRef.current);
    }

    if (!isAuthed || !activeSessionId) {
      setResume(null);
      setEvaluation(null);
      return;
    }

    setEvaluation(evaluationCacheRef.current[activeSessionId] || null);

    sessionLoaderTimerRef.current = setTimeout(() => {
      setShowSessionLoadingHint(true);
    }, 500);

    loadResume(activeSessionId)
      .then(() => {
        setShowSessionLoadingHint(false);
        if (sessionLoaderTimerRef.current) {
          clearTimeout(sessionLoaderTimerRef.current);
        }
      })
      .catch((loadError) => {
        setError(loadError.message);
        setShowSessionLoadingHint(false);
        if (sessionLoaderTimerRef.current) {
          clearTimeout(sessionLoaderTimerRef.current);
        }
      });
    loadEvaluation(activeSessionId).catch(() => {});
  }, [activeSessionId, isAuthed, loadEvaluation, loadResume]);

  useEffect(() => {
    if (!activeSessionId || !resume?.session) {
      return;
    }

    const isProcessing = resume.session.status === "PROCESSING_EVALUATION";
    if (!isProcessing) {
      setFinalizeLoading(false);
      return;
    }

    const timer = setInterval(() => {
      loadEvaluation(activeSessionId).catch(() => {});
      loadResume(activeSessionId).catch(() => {});
    }, 3200);

    return () => clearInterval(timer);
  }, [activeSessionId, loadEvaluation, loadResume, resume?.session]);

  useEffect(() => {
    if (!evaluation?.createdAt || !activeSessionId) {
      return;
    }

    setFinalizeLoading(false);

    if (autoOpenEvalSessionId !== activeSessionId) {
      return;
    }

    const key = `${activeSessionId}:${evaluation.createdAt}`;
    if (openedEvaluationKeyRef.current === key) {
      return;
    }

    openedEvaluationKeyRef.current = key;
    setShowEvaluationModal(true);
    setScoreExpanded(true);
    setAutoOpenEvalSessionId(null);
  }, [activeSessionId, autoOpenEvalSessionId, evaluation?.createdAt]);

  useEffect(() => {
    if (!isResizingHeight) {
      return;
    }

    function onMouseMove(event) {
      if (!chatPrimaryRef.current) {
        return;
      }

      const rect = chatPrimaryRef.current.getBoundingClientRect();
      const nextPct = ((event.clientY - rect.top) / rect.height) * 100;
      const clamped = Math.min(78, Math.max(36, nextPct));
      setTranscriptHeightPct(clamped);
    }

    function onMouseUp() {
      setIsResizingHeight(false);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizingHeight]);

  useEffect(() => {
    if (!openSessionMenuId) {
      return;
    }

    function onPointerDown(event) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest(".session-item-actions")) {
        return;
      }
      if (target.closest(".session-global-menu")) {
        return;
      }

      setOpenSessionMenuId(null);
      setSessionMenuPos(null);
    }

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [openSessionMenuId]);

  useEffect(() => {
    if (!openSessionMenuId) {
      return;
    }

    function onAnyScroll() {
      setOpenSessionMenuId(null);
      setSessionMenuPos(null);
    }

    window.addEventListener("scroll", onAnyScroll, true);
    return () => window.removeEventListener("scroll", onAnyScroll, true);
  }, [openSessionMenuId]);

  useEffect(() => {
    if (!showUserMenu) {
      return;
    }

    function onAnyScroll() {
      setShowUserMenu(false);
      setUserMenuPos(null);
    }

    window.addEventListener("scroll", onAnyScroll, true);
    return () => window.removeEventListener("scroll", onAnyScroll, true);
  }, [showUserMenu]);

  const turns = useMemo(() => {
    const persistedTurns = resume?.recentTurns || [];
    const streamedTurns = Object.values(liveTurns);
    return [...persistedTurns, ...streamedTurns].slice(-260);
  }, [liveTurns, resume?.recentTurns]);

  const stageState = resume?.session?.stageState || "SMALL_TALK";
  const stageSuggestions = STAGE_SUGGESTIONS[stageState] || STAGE_SUGGESTIONS.SMALL_TALK;
  const currentStageIndex = Math.max(STAGE_SEQUENCE.indexOf(stageState), 0);
  const openMenuSession = openSessionMenuId
    ? sessions.find((session) => session.id === openSessionMenuId)
    : null;
  const isFirstSession = sessions.length === 0;

  const latestTurnAt = turns.length ? turns[turns.length - 1].createdAt : null;
  const hasConversationChanges =
    !evaluation || Object.keys(liveTurns).length > 0 || toMs(latestTurnAt) > toMs(evaluation.createdAt);

  const finalizeLabel = !activeSessionReady
    ? "Loading Session..."
    : evaluation
      ? hasConversationChanges
        ? "Finalize + Re-evaluate"
        : "See Score Below"
      : "Finalize + Evaluate";

  const primaryRowsStyle = activeSessionReady
    ? {
        gridTemplateRows: `${transcriptHeightPct}% 6px calc(${100 - transcriptHeightPct}% - 6px)`
      }
    : undefined;

  const displayedSessionReady = Boolean(resume?.session);

  function syncUrl(sessionId, mode = "push") {
    if (typeof window === "undefined") {
      return;
    }

    const nextPath = sessionId ? `/session/${sessionId}` : "/";
    if (window.location.pathname === nextPath) {
      return;
    }

    if (mode === "replace") {
      window.history.replaceState({}, "", nextPath);
      return;
    }

    window.history.pushState({}, "", nextPath);
  }

  function scrollToScoreSection() {
    setScoreExpanded(true);
    scorePanelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
  }

  const handleAuthed = useCallback(
    (user) => {
      if (!user?.id) {
        return;
      }
      setCurrentUser(user);
      setAuthStatus("authed");
      setError("");
    },
    [setAuthStatus]
  );

  function startComposerOverlay() {
    if (!isAuthed) {
      return;
    }

    setNewSessionButtonFading(true);
    if (newSessionTimerRef.current) {
      clearTimeout(newSessionTimerRef.current);
    }

    newSessionTimerRef.current = setTimeout(() => {
      setShowComposerOverlay(true);
      setComposerOverlayPhase("opening");
      requestAnimationFrame(() => setComposerOverlayPhase("open"));
      setNewSessionButtonFading(false);
    }, 180);
  }

  function closeComposerOverlay() {
    setComposerOverlayPhase("closing");
    if (composerCloseTimerRef.current) {
      clearTimeout(composerCloseTimerRef.current);
    }
    composerCloseTimerRef.current = setTimeout(() => {
      setShowComposerOverlay(false);
      setComposerOverlayPhase("closed");
    }, 280);
  }

  function handleSessionClick(sessionId) {
    if (!isAuthed) {
      return;
    }
    setOpenSessionMenuId(null);
    setSessionMenuPos(null);
    setActiveSessionId(sessionId);
    syncUrl(sessionId, "push");
  }

  function handleCreatedSession({ sessionId }) {
    setActiveSessionId(sessionId);
    setAutoOpenEvalSessionId(null);
    syncUrl(sessionId, "push");
    loadSessions().catch(() => {});

    if (showComposerOverlay) {
      closeComposerOverlay();
    }
  }

  function handleSessionMenuToggle(event, session) {
    event.stopPropagation();
    setError("");

    if (openSessionMenuId === session.id) {
      setOpenSessionMenuId(null);
      setSessionMenuPos(null);
      return;
    }

    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement)) {
      setOpenSessionMenuId(session.id);
      setSessionMenuPos(null);
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const estimatedHeight = 74;
    const openUp = rect.bottom + estimatedHeight > window.innerHeight - 8;

    setSessionMenuPos({
      left: rect.right,
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      up: openUp
    });
    setOpenSessionMenuId(session.id);
  }

  function toggleUserMenu(event) {
    event.stopPropagation();
    setError("");

    if (!currentUser) {
      return;
    }

    if (showUserMenu) {
      setShowUserMenu(false);
      setUserMenuPos(null);
      return;
    }

    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement)) {
      setShowUserMenu(true);
      setUserMenuPos(null);
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const estimatedHeight = 44;
    const openUp = rect.top - estimatedHeight < 8;

    setUserMenuPos({
      left: rect.right,
      top: openUp ? rect.bottom + 6 : rect.top - 6,
      up: !openUp
    });
    setShowUserMenu(true);
  }

  async function logout() {
    setShowUserMenu(false);
    setUserMenuPos(null);
    await authLogout();
    clearAuth();
    syncUrl(null, "replace");
  }

  async function renameSession(event, session) {
    event.stopPropagation();
    const proposed = window.prompt("Rename this session", session.goal || "");
    if (proposed === null) {
      setOpenSessionMenuId(null);
      setSessionMenuPos(null);
      return;
    }

    const nextGoal = proposed.trim();
    if (!nextGoal) {
      setError("Session name cannot be empty.");
      return;
    }

    setSessionActionBusyId(session.id);
    setError("");

    try {
      const data = await graphqlRequest(mutations.renameSession, {
        input: {
          sessionId: session.id,
          goal: nextGoal
        }
      });

      const renamed = data.renameSession;
      setSessions((prev) =>
        prev.map((session) =>
          session.id === renamed.id
            ? { ...session, goal: renamed.goal, updatedAt: renamed.updatedAt }
            : session
        )
      );
      setResume((prev) =>
        prev?.session?.id === renamed.id
          ? {
              ...prev,
              session: {
                ...prev.session,
                goal: renamed.goal,
                updatedAt: renamed.updatedAt
              }
            }
          : prev
      );
      setOpenSessionMenuId(null);
      setSessionMenuPos(null);
    } catch (renameError) {
      setError(renameError.message);
    } finally {
      setSessionActionBusyId("");
    }
  }

  async function deleteSession(event, session) {
    event.stopPropagation();
    if (!window.confirm("Delete this session and all transcript data? This cannot be undone.")) {
      return;
    }

    setSessionActionBusyId(session.id);
    setError("");

    try {
      await graphqlRequest(mutations.deleteSession, { sessionId: session.id });
      delete evaluationCacheRef.current[session.id];

      const remaining = sessions.filter((item) => item.id !== session.id);
      setSessions(remaining);

      if (activeSessionId === session.id) {
        const nextSessionId = remaining[0]?.id || null;
        setActiveSessionId(nextSessionId);
        syncUrl(nextSessionId, "replace");
      }

      setOpenSessionMenuId(null);
      setSessionMenuPos(null);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setSessionActionBusyId("");
    }
  }

  async function handleGenerateEmail() {
    if (!activeSessionId) {
      return;
    }

    setEmailLoading(true);
    setError("");

    try {
      const data = await graphqlRequest(mutations.generateFollowupEmail, {
        input: {
          sessionId: activeSessionId,
          tone: "professional",
          length: "medium"
        }
      });
      setFollowupEmail(data.generateFollowupEmail);
    } catch (emailError) {
      setError(emailError.message);
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleFinalizeAction() {
    if (!activeSessionId) {
      return;
    }

    if (evaluation && !hasConversationChanges) {
      scrollToScoreSection();
      return;
    }

    setFinalizeLoading(true);
    setError("");
    setAutoOpenEvalSessionId(activeSessionId);

    try {
      await graphqlRequest(mutations.finalizeNetworkingSession, { sessionId: activeSessionId });
      await loadResume(activeSessionId);
      await loadEvaluation(activeSessionId);
    } catch (finalizeError) {
      setFinalizeLoading(false);
      setAutoOpenEvalSessionId(null);
      setError(finalizeError.message);
    }
  }

  return (
    <section className={`workspace-layout ${isResizingHeight ? "is-resizing-height" : ""}`}>
      <aside className="chat-sidebar">
        <div className="chat-sidebar-head">
          <button
            type="button"
            className={`ghost-button new-session-trigger ${newSessionButtonFading ? "is-fading" : ""}`}
            onClick={startComposerOverlay}
            disabled={!isAuthed || authStatus === "loading" || showComposerOverlay}
          >
            + New Session
          </button>
        </div>

        <div className="chat-session-list">
          {authStatus === "loading" ? (
            <p className="muted with-inline-spinner">
              <LoadingSpinner />
              <span>Checking account...</span>
            </p>
          ) : null}
          {!isAuthed ? <p className="muted">Sign in to start.</p> : null}
          {isAuthed && loadingSessions && sessions.length === 0 ? (
            <p className="muted with-inline-spinner">
              <LoadingSpinner />
              <span>Loading sessions...</span>
            </p>
          ) : null}
          {isAuthed && !loadingSessions && sessions.length === 0 ? (
            <p className="muted">No sessions yet.</p>
          ) : null}
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`session-list-item ${session.id === activeSessionId ? "active" : ""} ${
                openSessionMenuId === session.id ? "menu-open" : ""
              }`}
            >
              <button
                type="button"
                className="session-list-main"
                onClick={() => handleSessionClick(session.id)}
                disabled={!isAuthed}
              >
                <strong>{session.goal}</strong>
                <span>{session.status}</span>
                <small>{new Date(session.updatedAt).toLocaleString()}</small>
              </button>

              <div className={`session-item-actions ${openSessionMenuId === session.id ? "open" : ""}`}>
                <button
                  type="button"
                  className="session-item-menu-trigger"
                  onClick={(event) => handleSessionMenuToggle(event, session)}
                  aria-label="Open session actions"
                  aria-expanded={openSessionMenuId === session.id}
                  disabled={!isAuthed || sessionActionBusyId === session.id}
                >
                  {sessionActionBusyId === session.id ? <LoadingSpinner size="small" /> : <span>⋯</span>}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="chat-sidebar-foot">
          {isAuthed && currentUser ? (
            <button
              type="button"
              className="user-menu-trigger"
              onClick={toggleUserMenu}
              aria-label="Account menu"
              aria-expanded={showUserMenu}
              title={currentUser.email}
            >
              <span>{currentUser.name}</span>
            </button>
          ) : null}
        </div>
      </aside>

      {showUserMenu && currentUser && userMenuPos ? (
        <div
          className={`session-global-menu ${userMenuPos.up ? "up" : ""}`}
          style={{ left: userMenuPos.left, top: userMenuPos.top }}
        >
          <button type="button" className="session-item-menu-btn danger" onClick={logout}>
            Logout
          </button>
        </div>
      ) : null}

      {openMenuSession && sessionMenuPos ? (
        <div
          className={`session-global-menu ${sessionMenuPos.up ? "up" : ""}`}
          style={{ left: sessionMenuPos.left, top: sessionMenuPos.top }}
        >
          <button
            type="button"
            className="session-item-menu-btn"
            onClick={(event) => renameSession(event, openMenuSession)}
          >
            Rename
          </button>
          <button
            type="button"
            className="session-item-menu-btn danger"
            onClick={(event) => deleteSession(event, openMenuSession)}
            disabled={sessionActionBusyId === openMenuSession.id}
          >
            Delete
          </button>
        </div>
      ) : null}

      <div className="chat-main">
        <div
          className={`chat-content ${followupEmail ? "with-email" : ""} ${
            showEvaluationModal ? "is-blurred" : ""
          }`}
        >
          <div className="chat-primary" ref={chatPrimaryRef} style={primaryRowsStyle}>
            {!hasSelectedSession ? (
              <div className="empty-stage">
                <div className="empty-stage-hero">
                  <p className="empty-stage-kicker">NetAI</p>
                  <h1>{isAuthed ? (isFirstSession ? "Let's Small-Talk Better." : "Pick a Session and Continue.") : "Let's Small-Talk Better."}</h1>
                  <p>
                    {isAuthed
                      ? isFirstSession
                        ? "Click + New Session in the left panel to start your first practice."
                        : "Select any session on the left, or click + New Session to create a new one."
                      : ""}
                  </p>

                  {authStatus === "none" ? <AuthForm onAuthed={handleAuthed} /> : null}
                </div>
              </div>
            ) : !displayedSessionReady ? (
              <div className="session-loading-stage">
                <p className="muted with-inline-spinner">
                  <LoadingSpinner />
                  <span>Loading session...</span>
                </p>
              </div>
            ) : (
              <>
                {shouldShowSessionLoader ? (
                  <div className="session-loading-overlay" aria-live="polite">
                    <p className="muted with-inline-spinner">
                      <LoadingSpinner />
                      <span>Loading session...</span>
                    </p>
                  </div>
                ) : null}

                <div className="chat-transcript-area">
                  <TranscriptPanel turns={turns} className="chat-transcript-panel" />
                </div>

                <div
                  className="chat-height-resizer"
                  onMouseDown={() => setIsResizingHeight(true)}
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Resize transcript and controls panels"
                />

                <div className="chat-bottom panel">
                  <div className="chat-bottom-stack">
                    <div className="button-row session-actions-row">
                      {realtimeStatus === "CONNECTED" ? (
                        <button type="button" onClick={disconnect}>
                          Disconnect Agent
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={connect}
                          className="with-spinner"
                          disabled={realtimeStatus === "CONNECTING"}
                        >
                          {realtimeStatus === "CONNECTING" ? <LoadingSpinner /> : null}
                          <span>{realtimeStatus === "CONNECTING" ? "Connecting..." : "Connect Agent"}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleGenerateEmail}
                        className="with-spinner"
                        disabled={emailLoading}
                      >
                        {emailLoading ? <LoadingSpinner /> : null}
                        <span>{emailLoading ? "Generating..." : "Generate Follow-up Email"}</span>
                      </button>

                      <button
                        type="button"
                        className="with-spinner"
                        onClick={handleFinalizeAction}
                        disabled={finalizeLoading || !activeSessionReady}
                      >
                        {finalizeLoading ? <LoadingSpinner /> : null}
                        <span>{finalizeLoading ? "Evaluating..." : finalizeLabel}</span>
                      </button>
                    </div>

                    <div className="stage-guidance session-stage-guidance">
                      <div className="stage-layout">
                        <div className="stage-left">
                          <div className="stage-progress" aria-label="Networking stage progress">
                            {STAGE_SEQUENCE.map((stage, index) => (
                              <span
                                key={stage}
                                className={`stage-pill ${
                                  index < currentStageIndex
                                    ? "stage-pill-done"
                                    : index === currentStageIndex
                                  ? "stage-pill-active"
                                  : ""
                                }`}
                              >
                                <span className="stage-pill-label">{formatStage(stage)}</span>
                                {index === currentStageIndex ? (
                                  <span className="stage-pill-meta">
                                    {currentStageIndex + 1}/{STAGE_SEQUENCE.length}
                                  </span>
                                ) : null}
                              </span>
                            ))}
                          </div>
                          <p className="muted stage-summary">
                            <strong>{formatStage(stageState)}:</strong>{" "}
                            {resume?.stageHint || "Loading stage guidance..."}
                          </p>
                        </div>

                        <div className="stage-right">
                          <p className="muted"><strong>Talking Suggestions</strong></p>
                          <div className="stage-tips-grid">
                            {stageSuggestions.map((tip, index) => (
                              <article
                                key={`${stageState}-${tip.id}`}
                                className="tip-card"
                                style={{ "--tip-delay": `${index * 80}ms` }}
                              >
                                <span className={`tip-icon tip-icon-${tip.icon}`}>
                                  <TipIcon type={tip.icon} />
                                </span>
                                <div className="tip-copy">
                                  <h4>{tip.title}</h4>
                                  <p>{tip.detail}</p>
                                </div>
                              </article>
                            ))}
                          </div>
                        </div>
                      </div>

                      {resume?.session?.status === "PROCESSING_EVALUATION" ? (
                        <p className="muted with-inline-spinner">
                          <LoadingSpinner />
                          <span>Evaluation in progress...</span>
                        </p>
                      ) : null}

                      {resume?.session?.status === "EVALUATION_FAILED" ? (
                        <p className="error">Evaluation failed. Please click Finalize + Evaluate again.</p>
                      ) : null}

                      {evaluation ? (
                        <div className="score-collapse-wrap" ref={scorePanelRef}>
                          <button
                            type="button"
                            className="score-collapse-toggle"
                            onClick={() => setScoreExpanded((prev) => !prev)}
                          >
                            {scoreExpanded ? "Hide Latest Score" : "Show Latest Score"}
                          </button>
                          <div className={`score-collapse ${scoreExpanded ? "open" : ""}`}>
                            <div className="score-panel">
                              <div className="score-panel-head">
                                <span className="score-panel-kicker">Latest Score</span>
                                <span className="score-panel-value">{evaluation.score}/10</span>
                              </div>

                              <div className="score-panel-row">
                                <span className="score-panel-row-title">Strengths</span>
                                <p>{evaluation.strengths.join("; ")}</p>
                              </div>

                              <div className="score-panel-row">
                                <span className="score-panel-row-title">Improvements</span>
                                <p>{evaluation.improvements.join("; ")}</p>
                              </div>

                              <div className="score-panel-row">
                                <span className="score-panel-row-title">Next Actions</span>
                                <p>{evaluation.nextActions.join("; ")}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {error ? <p className="error">{error}</p> : null}
                  </div>
                </div>
              </>
            )}
          </div>

          <aside className={`email-drawer ${followupEmail && hasSelectedSession ? "open" : ""}`}>
            <div className="email-drawer-card">
              <div className="email-drawer-header">
                <h3>Follow-up Email</h3>
                {followupEmail ? (
                  <button type="button" className="ghost-button" onClick={() => setFollowupEmail(null)}>
                    Hide
                  </button>
                ) : null}
              </div>
              {followupEmail ? (
                <>
                  <p>
                    <strong>Subject:</strong> {followupEmail.subject}
                  </p>
                  <pre>{followupEmail.body}</pre>
                </>
              ) : (
                <p className="muted">Generate follow-up email to show draft here.</p>
              )}
            </div>
          </aside>
        </div>

        {showComposerOverlay ? (
          <div className={`composer-overlay ${composerOverlayPhase}`}>
            <div className={`composer-overlay-card ${composerOverlayPhase}`}>
              <SessionComposer
                onCreated={handleCreatedSession}
                onCancel={closeComposerOverlay}
                mode="overlay"
              />
            </div>
          </div>
        ) : null}

        {showEvaluationModal && evaluation ? (
          <div className="evaluation-modal">
            <div className="evaluation-card">
              <div className="evaluation-header">
                <h3>Evaluation Result</h3>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setShowEvaluationModal(false)}
                >
                  Close
                </button>
              </div>
              <p className="score">Score: {evaluation.score}/10</p>
              <p>
                <strong>Strengths:</strong> {evaluation.strengths.join("; ")}
              </p>
              <p>
                <strong>Improvements:</strong> {evaluation.improvements.join("; ")}
              </p>
              <p>
                <strong>Next Actions:</strong> {evaluation.nextActions.join("; ")}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

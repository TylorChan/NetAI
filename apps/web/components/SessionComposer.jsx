"use client";

import { useId, useMemo, useRef, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { graphqlRequest, mutations } from "@/lib/graphql";
import { API_BASE_URL } from "@/lib/config";

const DEFAULT_TARGET_CONTEXT =
  "Target professional context: engineering manager in a SaaS/AI team, focused on cross-functional product delivery.";
const DEFAULT_CUSTOM_CONTEXT =
  "Practice friendly small-talk opening, ask deeper project questions, then close with one recruiting advice request.";

export default function SessionComposer({
  onCreated,
  onCancel,
  mode = "inline"
}) {
  const tooltipId = useId();
  const targetProfileContextId = useId();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [importError, setImportError] = useState("");
  const [form, setForm] = useState({
    goal: "Networking with software engineering managers",
    targetProfileContext: "",
    customContext: ""
  });

  const layoutClass = useMemo(
    () => `composer-form ${mode === "overlay" ? "composer-overlay-layout" : "composer-inline-layout"}`,
    [mode]
  );

  function onChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function importFromImages(files) {
    const images = Array.from(files || []).filter(Boolean);
    if (!images.length) return;

    setImporting(true);
    setImportError("");

    try {
      const formData = new FormData();
      for (const file of images) {
        formData.append("images", file, file.name);
      }

      const response = await fetch(`${API_BASE_URL}/v1/profile/target-profile-from-images`, {
        method: "POST",
        body: formData,
        credentials: "include",
        cache: "no-store"
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Image import failed");
      }

      const nextText = String(payload?.targetProfileContext || "").trim();
      if (!nextText) {
        throw new Error("No profile context detected in image.");
      }

      setForm((prev) => ({
        ...prev,
        targetProfileContext: nextText
      }));
    } catch (importErr) {
      setImportError(importErr.message);
    } finally {
      setImporting(false);
    }
  }

  function onChooseImages() {
    if (loading || importing) return;
    fileInputRef.current?.click?.();
  }

  function onImagesSelected(event) {
    const files = event.target.files;
    importFromImages(files).catch(() => {});
    // Allow re-selecting the same file(s).
    event.target.value = "";
  }

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const targetProfileContext = form.targetProfileContext.trim() || DEFAULT_TARGET_CONTEXT;
      const customContext = form.customContext.trim() || DEFAULT_CUSTOM_CONTEXT;

      const data = await graphqlRequest(mutations.startNetworkingSession, {
        input: {
          goal: form.goal.trim(),
          targetProfileContext,
          customContext
        }
      });

      onCreated?.({
        sessionId: data.startNetworkingSession.id
      });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={layoutClass} onSubmit={onSubmit}>
      <div className={mode === "overlay" ? "composer-overlay-scroll" : ""}>
        <div className="composer-head">
          <h2>Start New Practice</h2>
          {onCancel ? (
            <button type="button" className="connect-agent-button" onClick={onCancel} disabled={loading}>
              Close
            </button>
          ) : null}
        </div>

        <label>
          Goal
          <input name="goal" value={form.goal} onChange={onChange} required />
        </label>

        <div className="composer-field">
          <div className="composer-field-head">
            <label className="composer-field-label" htmlFor={targetProfileContextId}>
              Target Profile Context
            </label>
            <span className="composer-label-actions">
              <button
                type="button"
                className="connect-agent-button import-image-button with-spinner"
                onClick={onChooseImages}
                disabled={loading || importing}
              >
                {importing ? <LoadingSpinner /> : null}
                <span>{importing ? "Importing..." : "Import From Image"}</span>
              </button>
              <span className="tooltip-wrap">
                <button
                  type="button"
                  className="tooltip-icon"
                  aria-describedby={tooltipId}
                  aria-label="Profile screenshot tip"
                >
                  i
                </button>
                <span id={tooltipId} role="tooltip" className="tooltip-bubble">
                  You can upload one or more screenshots of your target LinkedIn profile.
                </span>
              </span>
            </span>
          </div>
          <textarea
            id={targetProfileContextId}
            name="targetProfileContext"
            value={form.targetProfileContext}
            onChange={onChange}
            rows={4}
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onImagesSelected}
          style={{ display: "none" }}
        />
        {importError ? <p className="error">{importError}</p> : null}

        <label>
          Custom Context
          <textarea
            name="customContext"
            value={form.customContext}
            onChange={onChange}
            rows={5}
          />
        </label>
      </div>

      <div className={mode === "overlay" ? "composer-overlay-actions" : ""}>
        {error ? <p className="error">{error}</p> : null}

        <button type="submit" disabled={loading} className="with-spinner composer-submit-button">
          {loading ? <LoadingSpinner /> : null}
          <span>{loading ? "Starting..." : "Start Practice"}</span>
        </button>
      </div>
    </form>
  );
}

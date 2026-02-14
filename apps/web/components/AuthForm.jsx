"use client";

import { useMemo, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { authLogin, authRegister } from "@/lib/auth";

export default function AuthForm({ onAuthed }) {
  const [mode, setMode] = useState("register");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: ""
  });

  const submitLabel = useMemo(() => (mode === "login" ? "Sign in" : "Register"), [mode]);

  function onChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const email = form.email.trim();
      const password = form.password;
      if (mode === "login") {
        const user = await authLogin({ email, password });
        onAuthed?.(user);
        return;
      }

      const name = form.name.trim();
      const user = await authRegister({ name, email, password });
      onAuthed?.(user);
    } catch (submitError) {
      const message = submitError?.message || "Authentication failed";
      if (mode === "register" && message === "Email already registered") {
        setMode("login");
        setError("Already registered. Login.");
        return;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-panel" role="region" aria-label="Account access">
      <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
        <button
          type="button"
          className={mode === "register" ? "active" : ""}
          onClick={() => setMode("register")}
          disabled={busy}
          role="tab"
          aria-selected={mode === "register"}
        >
          Register
        </button>
        <button
          type="button"
          className={mode === "login" ? "active" : ""}
          onClick={() => setMode("login")}
          disabled={busy}
          role="tab"
          aria-selected={mode === "login"}
        >
          Login
        </button>
      </div>

      <form className="auth-form" onSubmit={onSubmit}>
        {mode === "register" ? (
          <label>
            Name
            <input
              name="name"
              value={form.name}
              onChange={onChange}
              placeholder="Your name"
              autoComplete="name"
              required
              disabled={busy}
            />
          </label>
        ) : null}

        <label>
          Email
          <input
            name="email"
            value={form.email}
            onChange={onChange}
            placeholder="you@email.com"
            autoComplete="email"
            inputMode="email"
            required
            disabled={busy}
          />
        </label>

        <label>
          Password
          <input
            name="password"
            value={form.password}
            onChange={onChange}
            type="password"
            placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            required
            disabled={busy}
          />
        </label>

        {error ? <p className="error auth-error">{error}</p> : null}

        <button type="submit" className="auth-submit with-spinner" disabled={busy}>
          {busy ? <LoadingSpinner /> : null}
          <span>{busy ? "Working..." : submitLabel}</span>
        </button>
      </form>
    </div>
  );
}

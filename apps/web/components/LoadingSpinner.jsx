"use client";

export default function LoadingSpinner({ size = "small" }) {
  return <span className={`loading-spinner ${size === "small" ? "small" : "medium"}`} aria-hidden />;
}

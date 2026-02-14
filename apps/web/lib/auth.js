export async function authRegister({ email, password, name }) {
  const response = await fetch("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
    credentials: "include",
    cache: "no-store"
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Registration failed");
  }
  return payload.user;
}

export async function authLogin({ email, password }) {
  const response = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    credentials: "include",
    cache: "no-store"
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Login failed");
  }
  return payload.user;
}

export async function authMe() {
  const response = await fetch("/api/v1/auth/me", {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return null;
  }
  return payload.user || null;
}

export async function authLogout() {
  await fetch("/api/v1/auth/logout", {
    method: "POST",
    credentials: "include",
    cache: "no-store"
  }).catch(() => {});
}


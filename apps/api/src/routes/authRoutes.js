import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSessionCookieName, signSessionToken, verifySessionToken } from "../auth/session.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(64)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128)
});

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date(row.created_at).toISOString()
  };
}

function cookieOptions(req) {
  // When proxied through Next.js /api, this becomes first-party, so Lax is correct.
  const isSecure = Boolean(req.secure) || req.headers["x-forwarded-proto"] === "https";
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
  };
}

export function registerAuthRoutes({ app, store, config, logger }) {
  const cookieName = getSessionCookieName();

  app.post("/v1/auth/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const name = parsed.data.name.trim();
    const password = parsed.data.password;

    const existing = await store.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    let userRow;
    try {
      userRow = await store.createUser({ id, email, name, passwordHash });
    } catch (error) {
      if (error?.code === "23505") {
        return res.status(409).json({ error: "Email already registered" });
      }
      throw error;
    }

    // One-time migration for projects that started as single-user "default-user".
    const userCount = await store.countUsers();
    if (userCount === 1) {
      await store.migrateLegacyDefaultUser({ newUserId: id });
      logger?.info("migrated legacy default-user data", { newUserId: id });
    }

    const token = signSessionToken({
      user: { id, email, name },
      jwtSecret: config.jwtSecret,
      expiresInSeconds: 60 * 60 * 24 * 30
    });

    res.cookie(cookieName, token, cookieOptions(req));
    return res.json({ user: publicUser(userRow) });
  });

  app.post("/v1/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;

    const userRow = await store.getUserByEmail(email);
    if (!userRow) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const ok = await bcrypt.compare(password, userRow.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signSessionToken({
      user: { id: userRow.id, email: userRow.email, name: userRow.name },
      jwtSecret: config.jwtSecret,
      expiresInSeconds: 60 * 60 * 24 * 30
    });

    res.cookie(cookieName, token, cookieOptions(req));
    return res.json({ user: publicUser(userRow) });
  });

  app.post("/v1/auth/logout", async (_req, res) => {
    res.clearCookie(cookieName, { path: "/" });
    return res.json({ ok: true });
  });

  app.get("/v1/auth/me", async (req, res) => {
    const token = req.cookies?.[cookieName];
    const decoded = verifySessionToken(token, config.jwtSecret);
    if (!decoded?.id) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    const row = await store.getUserById(decoded.id);
    if (!row) {
      res.clearCookie(cookieName, { path: "/" });
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    return res.json({ user: publicUser(row) });
  });
}

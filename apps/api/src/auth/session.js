import jwt from "jsonwebtoken";

const COOKIE_NAME = "netai_session";

export function getSessionCookieName() {
  return COOKIE_NAME;
}

export function signSessionToken({ user, jwtSecret, expiresInSeconds }) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name
    },
    jwtSecret,
    {
      expiresIn: expiresInSeconds
    }
  );
}

export function verifySessionToken(token, jwtSecret) {
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, jwtSecret);
    if (!decoded || typeof decoded !== "object" || !decoded.sub) {
      return null;
    }

    return {
      id: String(decoded.sub),
      email: String(decoded.email || ""),
      name: String(decoded.name || "")
    };
  } catch {
    return null;
  }
}

function parseCookieHeader(header) {
  if (!header) return {};
  return header.split(";").reduce((acc, part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return acc;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

export function getUserFromHeaders({ cookieHeader, authorizationHeader, jwtSecret }) {
  const auth = String(authorizationHeader || "");
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    const user = verifySessionToken(token, jwtSecret);
    if (user) return user;
  }

  const cookies = parseCookieHeader(cookieHeader);
  const token = cookies[COOKIE_NAME];
  return verifySessionToken(token, jwtSecret);
}


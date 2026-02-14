const DEFAULT_API_SERVER = "http://localhost:4000";

function getApiServerUrl() {
  const raw = process.env.API_SERVER_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const normalized = raw.trim() || DEFAULT_API_SERVER;
  return normalized.replace(/\/+$/, "");
}

function filterRequestHeaders(headers) {
  const next = new Headers();
  const allowList = [
    "content-type",
    "authorization",
    "cookie",
    "user-agent",
    "x-forwarded-proto",
    "x-forwarded-host",
    "x-forwarded-for"
  ];
  for (const [key, value] of headers.entries()) {
    if (allowList.includes(key.toLowerCase())) {
      next.set(key, value);
    }
  }
  return next;
}

export async function proxyJson(request, upstreamPath) {
  const api = getApiServerUrl();
  const url = `${api}${upstreamPath}`;

  const upstream = await fetch(url, {
    method: request.method,
    headers: filterRequestHeaders(request.headers),
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
    redirect: "manual",
    cache: "no-store"
  });

  const body = await upstream.text();
  const headers = new Headers();

  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const setCookie = upstream.headers.get("set-cookie");
  if (setCookie) headers.set("set-cookie", setCookie);

  return new Response(body, {
    status: upstream.status,
    headers
  });
}

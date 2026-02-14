import { proxyJson } from "../../_proxy";

function upstreamPathFromRequest(request) {
  const { pathname } = new URL(request.url);
  const suffix = pathname.replace(/^\/api\/v1\/?/, "");
  return `/v1/${suffix}`;
}

export async function GET(request) {
  return proxyJson(request, upstreamPathFromRequest(request));
}

export async function POST(request) {
  return proxyJson(request, upstreamPathFromRequest(request));
}

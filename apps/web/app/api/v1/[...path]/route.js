import { proxyJson } from "../../_proxy";

export async function GET(request, { params }) {
  const path = Array.isArray(params?.path) ? params.path.join("/") : "";
  return proxyJson(request, `/v1/${path}`);
}

export async function POST(request, { params }) {
  const path = Array.isArray(params?.path) ? params.path.join("/") : "";
  return proxyJson(request, `/v1/${path}`);
}


import { proxyJson } from "../_proxy";

export async function POST(request) {
  return proxyJson(request, "/graphql");
}


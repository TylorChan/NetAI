import { proxyRaw } from "../../../_proxy";

export async function POST(request) {
  return proxyRaw(request, "/v1/profile/target-profile-from-images");
}


export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    if (incoming.pathname === "/api" || incoming.pathname.startsWith("/api/")) {
      return proxyApiRequest(request, env, incoming);
    }
    return env.ASSETS.fetch(request);
  },
};

async function proxyApiRequest(request, env, incoming) {
  if (!env.API_ORIGIN) {
    return jsonError("API_ORIGIN is not configured", 503);
  }
  let apiOrigin;
  try {
    apiOrigin = new URL(String(env.API_ORIGIN).replace(/\/+$/, ""));
  } catch {
    return jsonError("API proxy is misconfigured", 500);
  }
  if (apiOrigin.protocol !== "https:") {
    return jsonError("API proxy requires HTTPS", 500);
  }

  const upstream = new URL(`${incoming.pathname}${incoming.search}`, `${apiOrigin.origin}/`);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", "https");
  headers.set("x-alpha-wolf-proxy", "first-party");

  const upstreamRequest = new Request(upstream, request);
  const upstreamResponse = await fetch(new Request(upstreamRequest, { headers }));
  const response = new Response(upstreamResponse.body, upstreamResponse);
  response.headers.set("cache-control", "no-store");
  response.headers.set("pragma", "no-cache");
  return response;
}

function jsonError(detail, status) {
  return Response.json(
    { detail },
    { status, headers: { "cache-control": "no-store" } },
  );
}

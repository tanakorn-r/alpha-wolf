const DEFAULT_API_ORIGIN = "https://alpha-wolf-api-6r4m3zptwq-an.a.run.app";

export async function onRequest({ request, env }) {
  let apiOrigin;
  try {
    apiOrigin = new URL(String(env.API_ORIGIN || DEFAULT_API_ORIGIN).replace(/\/+$/, ""));
  } catch {
    return new Response("API proxy is misconfigured", { status: 500 });
  }
  if (apiOrigin.protocol !== "https:") {
    return new Response("API proxy requires HTTPS", { status: 500 });
  }

  const incoming = new URL(request.url);
  const upstream = new URL(`${incoming.pathname}${incoming.search}`, `${apiOrigin.origin}/`);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", "https");

  const upstreamRequest = new Request(upstream, request);
  return fetch(new Request(upstreamRequest, { headers }));
}

import assert from "node:assert/strict";
import worker from "../worker.js";

const upstreamRequests = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (request) => {
  upstreamRequests.push(request);
  return new Response('{"user":null}', {
    headers: {
      "content-type": "application/json",
      "set-cookie": "aw_session=test; Path=/; Secure; HttpOnly",
    },
  });
};

try {
  const env = {
    ASSETS: {
      fetch: async (request) => new Response(`asset:${new URL(request.url).pathname}`),
    },
  };
  const apiResponse = await worker.fetch(
    new Request("https://alpha-wolf.example/api/auth/me?source=test", {
      method: "POST",
      headers: { cookie: "aw_session=old", "content-type": "application/json" },
      body: "{}",
    }),
    env,
  );
  assert.equal(apiResponse.headers.get("content-type"), "application/json");
  assert.match(apiResponse.headers.get("set-cookie") || "", /aw_session=test/);
  assert.equal(upstreamRequests.length, 1);
  assert.equal(upstreamRequests[0].url, "https://alpha-wolf-api-6r4m3zptwq-an.a.run.app/api/auth/me?source=test");
  assert.equal(upstreamRequests[0].method, "POST");
  assert.equal(await upstreamRequests[0].text(), "{}");

  const assetResponse = await worker.fetch(new Request("https://alpha-wolf.example/hunt-ai"), env);
  assert.equal(await assetResponse.text(), "asset:/hunt-ai");
  console.log("Worker API proxy test passed");
} finally {
  globalThis.fetch = originalFetch;
}

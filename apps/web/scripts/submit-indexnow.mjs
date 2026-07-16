import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(scriptDir, "../public");
const origin = "https://alpha-wolf.lufas2603.workers.dev";
const key = "0ed4ccae53d55531ba19462acae579e7";
const keyLocation = `${origin}/${key}.txt`;

const hostedKey = (await readFile(path.join(publicDir, `${key}.txt`), "utf8")).trim();
assert.equal(hostedKey, key, "The public IndexNow key file must contain the configured key");

const sitemap = await readFile(path.join(publicDir, "sitemap.xml"), "utf8");
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert.ok(urlList.length > 0, "The sitemap must contain at least one URL");
for (const url of urlList) assert.equal(new URL(url).origin, origin, `IndexNow URL must belong to ${origin}`);

const response = await fetch("https://api.indexnow.org/IndexNow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(origin).host, key, keyLocation, urlList }),
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`IndexNow rejected the submission (${response.status}): ${body || response.statusText}`);
}

console.log(`IndexNow accepted ${urlList.length} canonical URLs (${response.status}).`);

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, "..");
const useDist = process.argv.includes("--dist");
const contentRoot = useDist ? path.resolve(webRoot, "../../dist/apps/web") : webRoot;
const publicRoot = useDist ? contentRoot : path.join(webRoot, "public");
const origin = "https://alpha-wolf.lufas2603.workers.dev";

const pages = [
  { file: path.join(contentRoot, "index.html"), url: `${origin}/` },
  { file: path.join(publicRoot, "ai-stock-analysis.html"), url: `${origin}/ai-stock-analysis.html` },
  { file: path.join(publicRoot, "ai-vs-dca-backtest.html"), url: `${origin}/ai-vs-dca-backtest.html` },
  { file: path.join(publicRoot, "dividend-buy-timing.html"), url: `${origin}/dividend-buy-timing.html` },
];

const read = (file) => readFile(file, "utf8");
const match = (html, pattern, label) => {
  const result = html.match(pattern);
  assert.ok(result, `Missing ${label}`);
  return result[1].trim();
};

const sitemap = await read(path.join(publicRoot, "sitemap.xml"));
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((item) => item[1]);
assert.deepEqual(sitemapUrls, pages.map((page) => page.url), "Sitemap URLs must exactly match public canonical pages");

for (const page of pages) {
  const html = await read(page.file);
  const title = match(html, /<title>([^<]+)<\/title>/i, `title in ${page.file}`);
  const description = match(html, /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i, `description in ${page.file}`);
  const canonical = match(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i, `canonical in ${page.file}`);
  const robots = match(html, /<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i, `robots meta in ${page.file}`);

  assert.ok(title.length >= 30 && title.length <= 65, `Title should be 30–65 characters: ${title}`);
  assert.ok(description.length >= 70 && description.length <= 190, `Description should be 70–190 characters: ${description}`);
  assert.equal(canonical, page.url, `Canonical mismatch in ${page.file}`);
  assert.match(robots, /index/i, `Page must be indexable: ${page.file}`);
  assert.doesNotMatch(robots, /noindex/i, `Page must not contain noindex: ${page.file}`);
  assert.match(html, /<h1[\s>]/i, `Missing H1 in ${page.file}`);

  const structuredData = [...html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
  assert.ok(structuredData.length > 0, `Missing JSON-LD in ${page.file}`);
  for (const block of structuredData) JSON.parse(block[1]);
}

const index = await read(path.join(contentRoot, "index.html"));
for (const page of pages.slice(1)) {
  const relativeUrl = new URL(page.url).pathname;
  assert.ok(index.includes(`href="${relativeUrl}"`), `Homepage must internally link to ${relativeUrl}`);
}
assert.match(index, /"@type":"SoftwareApplication"/, "Homepage must describe the product as SoftwareApplication");
assert.match(index, /"@type":"FAQPage"/, "Homepage FAQ content must have matching structured data");

const robots = await read(path.join(publicRoot, "robots.txt"));
assert.match(robots, /User-agent:\s*\*/i, "robots.txt must cover all crawlers");
assert.match(robots, /Allow:\s*\//i, "robots.txt must allow public crawling");
assert.doesNotMatch(robots, /Disallow:\s*\/\s*(?:\n|$)/i, "robots.txt must not block the entire site");
assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`), "robots.txt must advertise the canonical sitemap");

const llms = await read(path.join(publicRoot, "llms.txt"));
assert.ok(llms.includes(`Canonical URL: ${origin}/`), "llms.txt must identify the canonical site");
for (const page of pages) assert.ok(llms.includes(page.url), `llms.txt must link to ${page.url}`);

console.log(`SEO checks passed for ${pages.length} canonical pages (${useDist ? "dist" : "source"}).`);

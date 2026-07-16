import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const handlers = {};
const deleted = [];
const navigated = [];
let skippedWaiting = false;
let claimed = false;
let unregistered = false;

const serviceWorker = {
  addEventListener(type, handler) { handlers[type] = handler; },
  skipWaiting() { skippedWaiting = true; return Promise.resolve(); },
  registration: {
    unregister() { unregistered = true; return Promise.resolve(true); },
  },
  clients: {
    claim() { claimed = true; return Promise.resolve(); },
    matchAll() {
      return Promise.resolve([
        { url: "https://alpha-wolf.example/", navigate(url) { navigated.push(url); return Promise.resolve(); } },
      ]);
    },
  },
};

const cacheStorage = {
  keys: () => Promise.resolve(["alpha-wolf-v1", "alpha-wolf-v2", "another-app-cache"]),
  delete: (key) => { deleted.push(key); return Promise.resolve(true); },
};

vm.runInNewContext(source, { self: serviceWorker, caches: cacheStorage, Promise });

let installWork;
handlers.install({ waitUntil(promise) { installWork = promise; } });
await installWork;

let activateWork;
handlers.activate({ waitUntil(promise) { activateWork = promise; } });
await activateWork;

assert.equal(skippedWaiting, true);
assert.equal(claimed, true);
assert.equal(unregistered, true);
assert.deepEqual(deleted.sort(), ["alpha-wolf-v1", "alpha-wolf-v2"]);
assert.deepEqual(navigated, ["https://alpha-wolf.example/"]);
assert.equal(handlers.fetch, undefined, "The retirement worker must never intercept network requests");
console.log("Service worker retirement test passed");

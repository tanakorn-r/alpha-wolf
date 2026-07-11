import { useEffect, useRef } from "react";

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);
const SCAN_DEBOUNCE_MS = 200;

type ChromeTranslator = { translate(text: string): Promise<string> };
type ChromeTranslatorCtor = { create(options: { sourceLanguage: string; targetLanguage: string }): Promise<ChromeTranslator> };

// Original text -> translated text. Module-level so it survives across route changes
// and repeats (nav labels, common words) never pay for a second translate call.
const translationCache = new Map<string, string>();
let translatorPromise: Promise<ChromeTranslator> | null = null;

// The on-device model isn't guaranteed to be downloaded/available even when the
// Translator API is present in the browser - create()/translate() can hang instead
// of rejecting in that case, so every call gets a hard timeout rather than risking
// the whole feature silently freezing forever.
const TRANSLATOR_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome translator timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function isChromeTranslatorSupported(): boolean {
  return typeof window !== "undefined" && "Translator" in window;
}

function getTranslator(): Promise<ChromeTranslator> {
  if (!translatorPromise) {
    const Translator = (window as unknown as { Translator: ChromeTranslatorCtor }).Translator;
    translatorPromise = withTimeout(Translator.create({ sourceLanguage: "en", targetLanguage: "th" }), TRANSLATOR_TIMEOUT_MS).catch((error) => {
      translatorPromise = null; // let the next pass try again instead of caching a dead promise
      throw error;
    });
  }
  return translatorPromise;
}

async function translateOne(text: string): Promise<string> {
  const cached = translationCache.get(text);
  if (cached) return cached;
  const translator = await getTranslator();
  const translated = await withTimeout(translator.translate(text), TRANSLATOR_TIMEOUT_MS);
  translationCache.set(text, translated);
  return translated;
}

function isTranslatable(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  if (!/[a-zA-Z]/.test(trimmed)) return false; // pure numbers/currency/symbols
  if (/^[A-Z0-9.\-]+$/.test(trimmed) && !trimmed.includes(" ")) return false; // looks like a ticker
  return true;
}

function collectTextNodes(root: Node, translatedTo: WeakMap<Text, string>): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node as Text;
      const current = text.textContent || "";
      // Skip only if this exact node still holds the exact text WE last translated it
      // to. React reuses stable DOM nodes across route changes (e.g. the page header
      // title lives in a component that never unmounts) and just mutates their text -
      // a plain "already seen" WeakSet would permanently ignore that node even after
      // its content changes to something new and untranslated.
      if (translatedTo.get(text) === current) return NodeFilter.FILTER_REJECT;
      const parent = text.parentElement;
      if (!parent || SKIP_TAGS.has(parent.tagName) || parent.closest("[data-no-translate]")) return NodeFilter.FILTER_REJECT;
      return isTranslatable(current) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

/** Translates the whole rendered page in place using Chrome's on-device Translator API
 * (free, local, no server call) by walking visible text nodes - deliberately DOM-based
 * rather than a per-string i18n dictionary, so it works on every page, including
 * AI-generated content, without touching every component. Chrome-only: on any other
 * browser (Safari, Firefox, iOS) this silently does nothing. */
export function usePageTranslate(language: "en" | "th") {
  const translatedToRef = useRef(new WeakMap<Text, string>());
  const previousLanguageRef = useRef(language);

  useEffect(() => {
    if (previousLanguageRef.current === "th" && language === "en") {
      // Nodes were mutated in place; the cleanest "lowest effort" way back to the
      // original English text is a reload rather than tracking a reverse mapping.
      window.location.reload();
      return;
    }
    previousLanguageRef.current = language;
  }, [language]);

  useEffect(() => {
    if (language !== "th" || !isChromeTranslatorSupported()) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let queued = false;

    async function runPass() {
      if (running) {
        queued = true;
        return;
      }
      running = true;
      try {
        const nodes = collectTextNodes(document.body, translatedToRef.current);
        if (!nodes.length) return;
        const uniqueOriginals = Array.from(new Set(nodes.map((node) => node.textContent || "")));
        try {
          await Promise.all(uniqueOriginals.map((text) => translateOne(text)));
        } catch {
          return; // best-effort: leave this pass untranslated, retry on the next mutation
        }
        for (const node of nodes) {
          const original = node.textContent || "";
          const translated = translationCache.get(original);
          if (translated) {
            node.textContent = translated;
            translatedToRef.current.set(node, translated);
          }
        }
      } finally {
        running = false;
        if (queued) {
          queued = false;
          void runPass();
        }
      }
    }

    function scheduleScan() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void runPass(), SCAN_DEBOUNCE_MS);
    }

    scheduleScan();
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [language]);
}

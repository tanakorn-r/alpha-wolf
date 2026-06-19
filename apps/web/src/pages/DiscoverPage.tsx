import { useDeferredValue, useEffect, useRef, useState } from "react";
import { loadDiscoveries, type DiscoveryItem, type DiscoverySection } from "../lib/api";
import type { StockRecord } from "../data/market";
import { strategyLabels } from "../data/market";
import { negative, panel, pillActive, pillInactive, positive, tag } from "../lib/ui";
import { useWolfStore } from "../store/useWolfStore";

const discoverKinds = [
  { key: "all", label: "All" },
  { key: "stock", label: "Stocks" },
  { key: "etf", label: "ETFs" },
  { key: "index", label: "Indexes" },
  { key: "mutualfund", label: "Funds" },
  { key: "currency", label: "FX" },
  { key: "cryptocurrency", label: "Crypto" },
  { key: "future", label: "Futures" }
] as const;

const livePageSize = 12;

function formatMoney(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2
  }).format(value);
}

function formatChange(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "0.00%";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatMarketCap(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(1)}T`;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return formatMoney(value);
}

export function DiscoverPage() {
  const searchQuery = useWolfStore((state) => state.searchQuery);
  const openDetail = useWolfStore((state) => state.openDetail);
  const selectedStrategy = useWolfStore((state) => state.selectedStrategy);
  const deferredSearch = useDeferredValue(searchQuery.trim());

  const [kind, setKind] = useState<(typeof discoverKinds)[number]["key"]>("all");
  const [sections, setSections] = useState<DiscoverySection[]>([]);
  const [lookupItems, setLookupItems] = useState<DiscoveryItem[]>([]);
  const [liveItems, setLiveItems] = useState<StockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liveLimit, setLiveLimit] = useState(livePageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLiveLimit(livePageSize);
  }, [deferredSearch, kind]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    loadDiscoveries({ q: deferredSearch || undefined, kind, limit: liveLimit })
      .then((payload) => {
        if (!active) return;
        setSections(payload.sections ?? []);
        setLookupItems(payload.items ?? []);
        setLiveItems(payload.live ?? []);
      })
      .catch(() => {
        if (!active) return;
        setSections([]);
        setLookupItems([]);
        setLiveItems([]);
        setError("Live discovery data is unavailable right now.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [deferredSearch, kind, liveLimit]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || loading || !liveItems.length) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && liveItems.length >= liveLimit) {
        setLiveLimit((current) => current + livePageSize);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, liveItems.length, liveLimit]);

  const resultCount = sections.reduce((sum, section) => sum + section.count, 0);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_0.85fr]">
      <div className="flex flex-col gap-5">
        <div className={panel}>
          <span className={tag}>Discover</span>
          <h1 className="mt-3 text-2xl font-extrabold text-slate-900">Search live names across every market type.</h1>
          <p className="mt-2 text-sm text-slate-500">
            Lookup supports stocks, ETFs, indexes, mutual funds, currencies, crypto, and futures. Pick a symbol and we open the full detail drawer.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {discoverKinds.map((item) => (
              <button key={item.key} type="button" onClick={() => setKind(item.key)} className={item.key === kind ? pillActive : pillInactive}>
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-400">Query</div>
              <div className="text-sm font-bold text-slate-900">{deferredSearch || "Explore live names"}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-400">Lookup results</div>
              <div className="text-sm font-bold text-slate-900">{resultCount}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-400">Strategy</div>
              <div className="text-sm font-bold text-slate-900">{strategyLabels[selectedStrategy]}</div>
            </div>
          </div>

          {error ? <div className="mt-4 text-sm text-rose-600">{error}</div> : null}
        </div>

        <div className="flex flex-col gap-4">
          {sections.length ? (
            sections.map((section) => (
              <div key={section.kind} className={panel}>
                <div className="mb-3">
                  <div className="text-base font-bold text-slate-900">{section.label}</div>
                  <div className="text-xs text-slate-400">{section.count} live matches</div>
                </div>
                <div className="flex flex-col gap-1">
                  {section.items.map((item) => (
                    <button
                      key={`${section.kind}-${item.symbol}`}
                      type="button"
                      onClick={() => openDetail(item.symbol)}
                      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-100"
                    >
                      <div className="flex min-w-0 flex-col">
                        <strong className="text-sm text-slate-900">{item.symbol}</strong>
                        <span className="truncate text-xs text-slate-400">{item.name}</span>
                        <div className="mt-1 flex gap-1.5">
                          {item.exchange ? <span className={tag}>{item.exchange}</span> : null}
                          {item.sector ? <span className={tag}>{item.sector}</span> : null}
                        </div>
                      </div>
                      <div className="flex flex-none flex-col items-end">
                        <div className={`text-sm font-semibold ${(item.changePct ?? 0) >= 0 ? positive : negative}`}>
                          {formatChange(item.changePct)}
                        </div>
                        <div className="text-sm font-bold text-slate-900">{formatMoney(item.price)}</div>
                        <div className="text-[11px] text-slate-400">Mkt cap {formatMarketCap(item.marketCap)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className={panel}>
              <div className="text-sm text-slate-400">
                {loading ? "Loading live discovery data..." : "No live lookup matches yet. Try a different query or market type."}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={panel}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">Top active now</div>
            <div className="text-lg font-extrabold text-slate-900">{liveItems.length} live names</div>
          </div>
          <span className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">Scroll to load more</span>
        </div>

        <div className="flex flex-col gap-1">
          {liveItems.length ? (
            liveItems.map((item) => (
              <button
                key={item.symbol}
                type="button"
                onClick={() => openDetail(item.symbol)}
                className="rounded-xl px-3 py-2.5 text-left hover:bg-slate-100"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <strong className="text-sm text-slate-900">{item.symbol}</strong>
                    <span className="truncate text-xs text-slate-400">{item.name}</span>
                  </div>
                  <div className={`text-sm font-semibold ${(item.changePct ?? 0) >= 0 ? positive : negative}`}>
                    {formatChange(item.changePct)}
                  </div>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-50">
                  <div
                    className={`h-full rounded-full ${(item.changePct ?? 0) >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
                    style={{ width: `${Math.min(Math.abs(item.changePct ?? 0) * 12, 100)}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {item.sector} - {strategyLabels[selectedStrategy]} fit {item.strategyScores[selectedStrategy] ?? 0}/100
                </div>
              </button>
            ))
          ) : (
            <div className="text-sm text-slate-400">No live active names are available right now.</div>
          )}

          <div ref={sentinelRef} className="py-2 text-center text-xs text-slate-400">
            {loading ? "Loading..." : "Keep scrolling for more live names"}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { loadDiscoveries, type DiscoveryItem, type DiscoverySection } from "../lib/api";
import type { StockRecord } from "../data/market";
import { strategyLabels } from "../data/market";
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
  if (value >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(1)}T`;
  }
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
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

    loadDiscoveries({
      q: deferredSearch || undefined,
      kind,
      limit: liveLimit
    })
      .then((payload) => {
        if (!active) {
          return;
        }

        setSections(payload.sections ?? []);
        setLookupItems(payload.items ?? []);
        setLiveItems(payload.live ?? []);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setSections([]);
        setLookupItems([]);
        setLiveItems([]);
        setError("Live discovery data is unavailable right now.");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
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

  const topLookup = lookupItems[0] ?? null;
  const resultCount = sections.reduce((sum, section) => sum + section.count, 0);
  const lookupPreview = sections.flatMap((section) => section.items).slice(0, 6);

  return (
    <div className="page-layout">
      <section className="discover-grid">
        <Card className="discover-hero">
          <CardHeader>
            <Badge>Discover</Badge>
            <CardTitle className="hero-title">Search live names across every market type.</CardTitle>
            <CardDescription className="hero-description">
              Lookup supports stocks, ETFs, indexes, mutual funds, currencies, crypto, and futures. Pick a symbol and we open the full detail drawer.
            </CardDescription>
          </CardHeader>

          <CardContent className="stack-gap">
            <div className="detail-pills">
              {discoverKinds.map((item) => {
                const active = item.key === kind;
                return (
                  <Button key={item.key} variant={active ? "default" : "secondary"} onClick={() => setKind(item.key)}>
                    {item.label}
                  </Button>
                );
              })}
            </div>

            <div className="summary-grid">
              <div className="summary-card">
                <div className="summary-label">Query</div>
                <div className="summary-value">{deferredSearch || "Explore live names"}</div>
                <div className="summary-copy">Use the global search bar or filter by market type.</div>
              </div>
              <div className="summary-card">
                <div className="summary-label">Lookup results</div>
                <div className="summary-value">{resultCount}</div>
                <div className="summary-copy">Grouped live matches from Yahoo Lookup.</div>
              </div>
              <div className="summary-card">
                <div className="summary-label">Strategy</div>
                <div className="summary-value">{strategyLabels[selectedStrategy]}</div>
                <div className="summary-copy">Results stay tied to the strategy you already picked.</div>
              </div>
            </div>

            {error ? <div className="empty-state">{error}</div> : null}

            <div className="discover-sections">
              {sections.length ? (
                sections.map((section) => (
                  <Card key={section.kind} className="discover-section">
                    <CardHeader>
                      <CardTitle>{section.label}</CardTitle>
                      <CardDescription>{section.count} live matches</CardDescription>
                    </CardHeader>
                    <CardContent className="discover-list">
                      {section.items.map((item) => (
                        <button key={`${section.kind}-${item.symbol}`} type="button" className="discover-row" onClick={() => openDetail(item.symbol)}>
                          <div className="discover-row-main">
                            <strong>{item.symbol}</strong>
                            <span>{item.name}</span>
                            <div className="discover-tags">
                              {item.exchange ? <span className="stock-tag">{item.exchange}</span> : null}
                              {item.sector ? <span className="stock-tag">{item.sector}</span> : null}
                              {item.industry ? <span className="stock-tag">{item.industry}</span> : null}
                            </div>
                          </div>
                          <div className="discover-row-side">
                            <div className={`stock-change ${(item.changePct ?? 0) >= 0 ? "positive" : "negative"}`}>{formatChange(item.changePct)}</div>
                            <div className="stock-price">{formatMoney(item.price)}</div>
                            <div className="discover-cap">Mkt cap {formatMarketCap(item.marketCap)}</div>
                          </div>
                        </button>
                      ))}
                    </CardContent>
                  </Card>
                ))
              ) : loading ? (
                <div className="empty-state">Loading live discovery data...</div>
              ) : (
                <div className="empty-state">No live lookup matches yet. Try a different query or market type.</div>
              )}
            </div>

            <div className="discover-preview">
              <div className="score-note">
                <div className="score-note-label">Preview</div>
                <div className="score-note-value">
                  {topLookup ? `${topLookup.symbol} · ${topLookup.name}` : "No symbol selected"}
                </div>
              <div className="peer-subcopy">Open a row to inspect the full chart, business outlook, and AI summary.</div>
              </div>
              <Progress value={Math.min(100, (lookupPreview.length / 6) * 100)} />
              <div className="discover-preview-grid">
                {lookupPreview.map((item) => (
                  <button key={item.symbol} className="discover-mini" type="button" onClick={() => openDetail(item.symbol)}>
                    <span>{item.symbol}</span>
                    <strong>{formatChange(item.changePct)}</strong>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="discover-side">
          <CardHeader>
            <CardDescription>Top active now</CardDescription>
            <div className="card-headline">
                <div className="card-amount">{liveItems.length} live names</div>
              <Badge variant="muted">Scroll to load more</Badge>
            </div>
          </CardHeader>

          <CardContent className="stack-gap">
            {liveItems.length ? (
              liveItems.map((item) => (
                <button key={item.symbol} type="button" className="active-now-row" onClick={() => openDetail(item.symbol)}>
                  <div className="active-now-main">
                    <strong>{item.symbol}</strong>
                    <span>{item.name}</span>
                  </div>
                  <div className={`active-now-change ${(item.changePct ?? 0) >= 0 ? "positive" : "negative"}`}>{formatChange(item.changePct)}</div>
                  <div className="active-now-meter">
                    <span
                      className={`active-now-fill ${(item.changePct ?? 0) >= 0 ? "positive" : "negative"}`}
                      style={{ width: `${Math.min(Math.abs(item.changePct ?? 0) * 12, 100)}%` }}
                    />
                  </div>
                  <div className="active-now-score">
                    {item.sector} · {strategyLabels[selectedStrategy]} fit {item.strategyScores[selectedStrategy] ?? 0}/100
                  </div>
                </button>
              ))
            ) : (
              <div className="empty-state">No live active names are available right now.</div>
            )}

            <div ref={sentinelRef} className="load-more-sentinel">
              {loading ? "Loading..." : "Keep scrolling for more live names"}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

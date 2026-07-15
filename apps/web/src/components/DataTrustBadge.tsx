import type { MarketDataTrust } from "../lib/api";
import { formatLocalDate, formatLocalDateTime } from "../lib/locale";

export function DataTrustBadge({ trust, className = "" }: { trust?: MarketDataTrust | null; className?: string }) {
  if (!trust) return <div className={`rounded-[9px] border border-[#f5c451]/35 bg-[#f5c451]/8 px-3 py-2 font-mono text-[10.5px] text-[#f5c451] ${className}`}>Market provenance unavailable · do not treat as current</div>;
  // Saved AI results retain the exact provenance snapshot used at generation time. Its
  // original status must not remain "delayed" forever: once any available decision dataset
  // passes the recorded expiry, the disclosure ages into STALE without requiring regeneration.
  const expiredDatasets = (trust.datasets ?? []).filter((dataset) => dataset.available && isExpired(dataset.expiresAt));
  const effectiveStatus = trust.status === "unavailable"
    ? "unavailable"
    : trust.stale || expiredDatasets.length
      ? "stale"
      : trust.status;
  const warning = effectiveStatus !== "delayed";
  const tone = warning ? "border-[#f5c451]/35 bg-[#f5c451]/8 text-[#f5c451]" : "border-[#2a2a31] bg-[#121214] text-[#8c8c95]";
  const timestampSource = trust.marketTimestampSource ?? inferTimestampSource(trust);
  const observation = timestampSource === "latest daily close"
    ? formatDate(trust.marketTimestamp)
    : formatTime(trust.marketTimestamp);
  return (
    <details className={`group rounded-[9px] border px-3 py-2 font-mono text-[10.5px] ${tone} ${className}`}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-[#ececee]">{trust.provider}</span>
        <span>· {timestampSource ?? "market observation"} {observation ?? "time missing"}</span>
        <span className={warning ? "font-bold uppercase" : "uppercase"}>· {effectiveStatus}</span>
        {trust.fallback.used ? <span>· fallback used</span> : null}
        {trust.missingFields.length ? <span>· {trust.missingFields.length} missing</span> : null}
        <span className="ml-auto text-[9px] uppercase tracking-[.08em] opacity-70 group-open:hidden">Details</span>
      </summary>
      <div className="mt-2 grid gap-1 border-t border-current/15 pt-2 leading-[1.55]">
        <div>Fetched {formatTime(trust.fetchedAt) ?? "time missing"}. Yahoo data may be delayed; fetched time is not market time.</div>
        {expiredDatasets.length ? <div>Expired: {expiredDatasets.map((item) => item.name).join(", ")}. Refresh market data before relying on this decision.</div> : null}
        {trust.fallback.used ? <div>Fallback: {trust.fallback.source}{trust.fallback.reason ? ` — ${trust.fallback.reason}` : ""}.</div> : null}
        {trust.missingFields.length ? <div>Missing: {trust.missingFields.slice(0, 8).join(", ")}{trust.missingFields.length > 8 ? ` +${trust.missingFields.length - 8} more` : ""}.</div> : null}
        {trust.policy ? <div>Policy: {trust.policy.fallback}. Missing values stay null.</div> : null}
      </div>
    </details>
  );
}

function formatTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatLocalDateTime(date);
}

function isExpired(value?: string | null) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatLocalDate(date);
}

function inferTimestampSource(trust: MarketDataTrust) {
  const quote = trust.datasets?.find((item) => item.name === "quote");
  const history = trust.datasets?.find((item) => item.name === "history");
  return !quote?.available && history?.available ? "latest daily close" : "market observation";
}

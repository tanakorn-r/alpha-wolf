import { create } from "zustand";
import type { StockRecord, StrategyKey } from "../data/market";
import type { UpwardMovesResponse } from "../lib/api";

const RESERVE_STORAGE_KEY = "aw_cash_reserve";
const PREMIUM_STORAGE_KEY = "aw_premium";
const DEEP_EXTRAS_STORAGE_KEY = "aw_deep_extras";
const N100_QUOTA_STORAGE_KEY = "aw_n100_quota_used";
const N100_REPORT_CACHE_STORAGE_KEY = "aw_n100_report_cache";
export const N100_QUOTA_LIMIT = 100;

export type Next10ReportCacheEntry = {
  analyzedAt: string;
  data: UpwardMovesResponse;
};

export type DetailMode = "swing" | "day" | "long" | "value" | "fomo";

type WolfState = {
  selectedStrategy: StrategyKey;
  selectedMode: DetailMode | null;
  selectedSymbol: string;
  detailOpen: boolean;
  deepSymbol: string;
  deepOpen: boolean;
  searchQuery: string;
  watchlist: StockRecord[];
  portfolioValue: number;
  portfolioGainPct: number;
  cashReserve: number;
  premium: boolean;
  deepExtras: string[];
  n100QuotaUsed: number;
  next10ReportCache: Record<string, Next10ReportCacheEntry>;
  setStrategy: (strategy: StrategyKey) => void;
  setSelectedMode: (mode: DetailMode | null) => void;
  setSelectedSymbol: (symbol: string) => void;
  openDetail: (symbol: string, mode?: DetailMode | null) => void;
  closeDetail: () => void;
  setDetailOpen: (open: boolean) => void;
  openDeepAnalysis: (symbol: string) => void;
  closeDeepAnalysis: () => void;
  setSearchQuery: (query: string) => void;
  setWatchlist: (rows: StockRecord[]) => void;
  setPortfolioSummary: (value: number, gainPct: number) => void;
  addCashReserve: (usdAmount: number) => void;
  spendCashReserve: (usdAmount: number) => void;
  unlockPremium: () => void;
  addDeepExtra: (symbol: string) => void;
  removeDeepExtra: (symbol: string) => void;
  useN100Quota: () => void;
  setNext10ReportCache: (key: string, entry: Next10ReportCacheEntry) => void;
  getNext10ReportCache: (key: string) => Next10ReportCacheEntry | undefined;
};

function loadReserve(): number {
  const raw = typeof window !== "undefined" ? window.localStorage.getItem(RESERVE_STORAGE_KEY) : null;
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : 0;
}

function persistReserve(value: number) {
  if (typeof window !== "undefined") window.localStorage.setItem(RESERVE_STORAGE_KEY, String(value));
}

function loadPremium(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(PREMIUM_STORAGE_KEY) === "1";
}

function loadDeepExtras(): string[] {
  const raw = typeof window !== "undefined" ? window.localStorage.getItem(DEEP_EXTRAS_STORAGE_KEY) : null;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function persistDeepExtras(symbols: string[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(DEEP_EXTRAS_STORAGE_KEY, JSON.stringify(symbols));
}

function loadN100Quota(): number {
  const raw = typeof window !== "undefined" ? window.localStorage.getItem(N100_QUOTA_STORAGE_KEY) : null;
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) ? Math.min(N100_QUOTA_LIMIT, Math.max(0, value)) : 0;
}

function persistN100Quota(value: number) {
  if (typeof window !== "undefined") window.localStorage.setItem(N100_QUOTA_STORAGE_KEY, String(value));
}

function loadNext10ReportCache(): Record<string, Next10ReportCacheEntry> {
  const raw = typeof window !== "undefined" ? window.localStorage.getItem(N100_REPORT_CACHE_STORAGE_KEY) : null;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, Next10ReportCacheEntry> : {};
  } catch {
    return {};
  }
}

function persistNext10ReportCache(value: Record<string, Next10ReportCacheEntry>) {
  if (typeof window !== "undefined") window.localStorage.setItem(N100_REPORT_CACHE_STORAGE_KEY, JSON.stringify(value));
}

export const useWolfStore = create<WolfState>((set, get) => ({
  selectedStrategy: "stable_dca",
  selectedMode: null,
  selectedSymbol: "",
  detailOpen: false,
  deepSymbol: "",
  deepOpen: false,
  searchQuery: "",
  watchlist: [],
  portfolioValue: 0,
  portfolioGainPct: 0,
  cashReserve: loadReserve(),
  premium: loadPremium(),
  deepExtras: loadDeepExtras(),
  n100QuotaUsed: loadN100Quota(),
  next10ReportCache: loadNext10ReportCache(),
  setStrategy: (selectedStrategy) => set({ selectedStrategy }),
  setSelectedMode: (selectedMode) => set({ selectedMode }),
  setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),
  openDetail: (selectedSymbol, selectedMode) => set({ selectedSymbol, detailOpen: true, ...(selectedMode !== undefined ? { selectedMode } : {}) }),
  closeDetail: () => set({ detailOpen: false }),
  setDetailOpen: (detailOpen) => set({ detailOpen }),
  openDeepAnalysis: (deepSymbol) => set({ deepSymbol, deepOpen: true }),
  closeDeepAnalysis: () => set({ deepOpen: false }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setWatchlist: (watchlist) => set({ watchlist }),
  setPortfolioSummary: (portfolioValue, portfolioGainPct) => set({ portfolioValue, portfolioGainPct }),
  addCashReserve: (usdAmount) => {
    const next = get().cashReserve + usdAmount;
    persistReserve(next);
    set({ cashReserve: next });
  },
  spendCashReserve: (usdAmount) => {
    const next = Math.max(0, get().cashReserve - usdAmount);
    persistReserve(next);
    set({ cashReserve: next });
  },
  unlockPremium: () => {
    if (typeof window !== "undefined") window.localStorage.setItem(PREMIUM_STORAGE_KEY, "1");
    set({ premium: true });
  },
  addDeepExtra: (symbol) => {
    const next = Array.from(new Set([...get().deepExtras, symbol]));
    persistDeepExtras(next);
    set({ deepExtras: next });
  },
  removeDeepExtra: (symbol) => {
    const next = get().deepExtras.filter((value) => value !== symbol);
    persistDeepExtras(next);
    set({ deepExtras: next });
  },
  useN100Quota: () => {
    const next = Math.min(N100_QUOTA_LIMIT, get().n100QuotaUsed + 1);
    persistN100Quota(next);
    set({ n100QuotaUsed: next });
  },
  setNext10ReportCache: (key, entry) => {
    const next = { ...get().next10ReportCache, [key]: entry };
    persistNext10ReportCache(next);
    set({ next10ReportCache: next });
  },
  getNext10ReportCache: (key) => get().next10ReportCache[key]
}));

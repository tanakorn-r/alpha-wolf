import { create } from "zustand";
import type { StockRecord, StrategyKey } from "../data/market";

const RESERVE_STORAGE_KEY = "aw_cash_reserve";
const PREMIUM_STORAGE_KEY = "aw_premium";
const DEEP_EXTRAS_STORAGE_KEY = "aw_deep_extras";
const N100_QUOTA_STORAGE_KEY = "aw_n100_quota_used";
export const N100_QUOTA_LIMIT = 100;

type WolfState = {
  selectedStrategy: StrategyKey;
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
  setStrategy: (strategy: StrategyKey) => void;
  setSelectedSymbol: (symbol: string) => void;
  openDetail: (symbol: string) => void;
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

export const useWolfStore = create<WolfState>((set, get) => ({
  selectedStrategy: "stable_dca",
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
  setStrategy: (selectedStrategy) => set({ selectedStrategy }),
  setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),
  openDetail: (selectedSymbol) => set({ selectedSymbol, detailOpen: true }),
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
  }
}));

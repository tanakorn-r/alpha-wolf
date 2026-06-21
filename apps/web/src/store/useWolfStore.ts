import { create } from "zustand";
import type { StockRecord, StrategyKey } from "../data/market";

export type Currency = "USD" | "THB";
export const FX_RATES: Record<Currency, number> = { USD: 1, THB: 36.5 };
export const CURRENCY_SYMBOL: Record<Currency, string> = { USD: "$", THB: "฿" };

const RESERVE_STORAGE_KEY = "aw_cash_reserve";

type WolfState = {
  selectedStrategy: StrategyKey;
  selectedSymbol: string;
  detailOpen: boolean;
  searchQuery: string;
  watchlist: StockRecord[];
  portfolioValue: number;
  portfolioGainPct: number;
  currency: Currency;
  cashReserve: number;
  setStrategy: (strategy: StrategyKey) => void;
  setSelectedSymbol: (symbol: string) => void;
  openDetail: (symbol: string) => void;
  closeDetail: () => void;
  setDetailOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setWatchlist: (rows: StockRecord[]) => void;
  setPortfolioSummary: (value: number, gainPct: number) => void;
  setCurrency: (currency: Currency) => void;
  addCashReserve: (usdAmount: number) => void;
  spendCashReserve: (usdAmount: number) => void;
};

function loadReserve(): number {
  const raw = typeof window !== "undefined" ? window.localStorage.getItem(RESERVE_STORAGE_KEY) : null;
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : 0;
}

function persistReserve(value: number) {
  if (typeof window !== "undefined") window.localStorage.setItem(RESERVE_STORAGE_KEY, String(value));
}

export const useWolfStore = create<WolfState>((set, get) => ({
  selectedStrategy: "stable_dca",
  selectedSymbol: "",
  detailOpen: false,
  searchQuery: "",
  watchlist: [],
  portfolioValue: 0,
  portfolioGainPct: 0,
  currency: "USD",
  cashReserve: loadReserve(),
  setStrategy: (selectedStrategy) => set({ selectedStrategy }),
  setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),
  openDetail: (selectedSymbol) => set({ selectedSymbol, detailOpen: true }),
  closeDetail: () => set({ detailOpen: false }),
  setDetailOpen: (detailOpen) => set({ detailOpen }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setWatchlist: (watchlist) => set({ watchlist }),
  setPortfolioSummary: (portfolioValue, portfolioGainPct) => set({ portfolioValue, portfolioGainPct }),
  setCurrency: (currency) => set({ currency }),
  addCashReserve: (usdAmount) => {
    const next = get().cashReserve + usdAmount;
    persistReserve(next);
    set({ cashReserve: next });
  },
  spendCashReserve: (usdAmount) => {
    const next = Math.max(0, get().cashReserve - usdAmount);
    persistReserve(next);
    set({ cashReserve: next });
  }
}));

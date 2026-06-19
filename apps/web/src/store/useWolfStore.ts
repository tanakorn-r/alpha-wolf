import { create } from "zustand";
import type { StockRecord, StrategyKey } from "../data/market";

type WolfState = {
  selectedStrategy: StrategyKey;
  selectedSymbol: string;
  detailOpen: boolean;
  searchQuery: string;
  watchlist: StockRecord[];
  setStrategy: (strategy: StrategyKey) => void;
  setSelectedSymbol: (symbol: string) => void;
  openDetail: (symbol: string) => void;
  closeDetail: () => void;
  setDetailOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setWatchlist: (rows: StockRecord[]) => void;
};

export const useWolfStore = create<WolfState>((set) => ({
  selectedStrategy: "capitalized",
  selectedSymbol: "",
  detailOpen: false,
  searchQuery: "",
  watchlist: [],
  setStrategy: (selectedStrategy) => set({ selectedStrategy }),
  setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),
  openDetail: (selectedSymbol) => set({ selectedSymbol, detailOpen: true }),
  closeDetail: () => set({ detailOpen: false }),
  setDetailOpen: (detailOpen) => set({ detailOpen }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setWatchlist: (watchlist) => set({ watchlist })
}));

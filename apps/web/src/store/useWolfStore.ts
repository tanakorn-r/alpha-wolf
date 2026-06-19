import { create } from "zustand";
import type { StockRecord, StrategyKey } from "../data/market";

type WolfState = {
  selectedStrategy: StrategyKey;
  selectedSymbol: string;
  detailOpen: boolean;
  searchQuery: string;
  radarIndex: string;
  radarSort: "score" | "change" | "trend";
  radarDirection: "desc" | "asc";
  watchlist: StockRecord[];
  setStrategy: (strategy: StrategyKey) => void;
  setSelectedSymbol: (symbol: string) => void;
  openDetail: (symbol: string) => void;
  closeDetail: () => void;
  setDetailOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setRadarIndex: (index: string) => void;
  setRadarSort: (sort: "score" | "change" | "trend") => void;
  setRadarDirection: (direction: "desc" | "asc") => void;
  setWatchlist: (rows: StockRecord[]) => void;
};

export const useWolfStore = create<WolfState>((set) => ({
  selectedStrategy: "capitalized",
  selectedSymbol: "",
  detailOpen: false,
  searchQuery: "",
  radarIndex: "all",
  radarSort: "score",
  radarDirection: "desc",
  watchlist: [],
  setStrategy: (selectedStrategy) => set({ selectedStrategy }),
  setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),
  openDetail: (selectedSymbol) => set({ selectedSymbol, detailOpen: true }),
  closeDetail: () => set({ detailOpen: false }),
  setDetailOpen: (detailOpen) => set({ detailOpen }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setRadarIndex: (radarIndex) => set({ radarIndex }),
  setRadarSort: (radarSort) => set({ radarSort }),
  setRadarDirection: (radarDirection) => set({ radarDirection }),
  setWatchlist: (watchlist) => set({ watchlist })
}));

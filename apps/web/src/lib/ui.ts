// Shared Tailwind class strings - plain constants, not component wrappers,
// so the markup stays in each page/file but the core "look" stays consistent.
export const panel = "rounded-[18px] border border-white/70 bg-white/78 p-4 shadow-[0_12px_36px_rgba(91,47,209,0.07)] backdrop-blur-xl";
export const panelTint = "rounded-[18px] border border-violet-100/70 bg-gradient-to-br from-white/85 via-violet-50/75 to-violet-100/60 p-4 shadow-[0_12px_36px_rgba(124,92,252,0.1)] backdrop-blur-xl";
export const panelMuted = "rounded-[18px] border border-white/70 bg-white/66 p-4 shadow-[0_12px_36px_rgba(91,47,209,0.06)] backdrop-blur-xl";
export const pill = "inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all";
export const pillActive = `${pill} bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25`;
export const pillInactive = `${pill} bg-white/70 text-slate-600 ring-1 ring-slate-200/70 hover:bg-white hover:text-slate-900`;
export const positive = "text-emerald-600";
export const negative = "text-rose-600";
export const badgePositive = "inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100";
export const badgeNegative = "inline-flex items-center rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-100";
export const tag = "inline-flex items-center rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200/70";
export const chip = "rounded-2xl bg-white/70 px-3 py-2.5 ring-1 ring-slate-200/70";

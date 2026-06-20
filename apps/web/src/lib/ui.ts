// Shared Tailwind class strings - plain constants, not component wrappers,
// so the markup stays in each page/file but the core "look" stays consistent.
export const panel = "rounded-xl border border-[#2a2a31] bg-[#161619] p-4";
export const panelTint = "rounded-xl border border-[#285f48] bg-[#173528] p-4";
export const panelMuted = "rounded-xl border border-[#2a2a31] bg-[#121214] p-4";
export const pill = "inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all";
export const pillActive = `${pill} bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25`;
export const pillInactive = `${pill} bg-white/70 text-slate-600 ring-1 ring-slate-200/70 hover:bg-white hover:text-slate-900`;
export const positive = "text-emerald-600";
export const negative = "text-rose-600";
export const badgePositive = "inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100";
export const badgeNegative = "inline-flex items-center rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-100";
export const tag = "inline-flex items-center rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200/70";
export const chip = "rounded-2xl bg-white/70 px-3 py-2.5 ring-1 ring-slate-200/70";

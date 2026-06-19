// Shared Tailwind class strings - plain constants, not component wrappers,
// so the markup stays in each page/file but the core "look" stays consistent.
export const panel = "rounded-2xl bg-white p-5 shadow-sm shadow-violet-100 ring-1 ring-violet-50";
export const pill = "inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition-colors";
export const pillActive = `${pill} bg-violet-600 text-white`;
export const pillInactive = `${pill} bg-violet-50 text-slate-600 hover:bg-violet-100`;
export const positive = "text-emerald-600";
export const negative = "text-rose-600";
export const badgePositive = "inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600";
export const badgeNegative = "inline-flex items-center rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600";
export const tag = "inline-flex items-center rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-600";

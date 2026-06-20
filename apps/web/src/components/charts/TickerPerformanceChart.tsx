import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { StockDetailResponse } from "../../lib/api";
import { formatCurrency } from "../../lib/format";
import { ChartState } from "./ChartState";

export function TickerPerformanceChart({ points, currency }: { points: StockDetailResponse["history"]; currency?: string }) {
  if (!points.length) return <ChartState state="empty" />;
  return <ResponsiveContainer width="100%" height="100%"><AreaChart data={points} margin={{ top: 14, right: 8, bottom: 0, left: 0 }}><defs><linearGradient id="tickerFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3ecf8e" stopOpacity={0.25}/><stop offset="100%" stopColor="#3ecf8e" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#242429" strokeDasharray="3 4" vertical={false}/><XAxis dataKey="date" tick={{ fill: "#5a5a62", fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={48}/><YAxis domain={["auto", "auto"]} tick={{ fill: "#5a5a62", fontSize: 9 }} axisLine={false} tickLine={false} width={46}/><Tooltip contentStyle={{ background: "#1c1c20", border: "1px solid #34343c", borderRadius: 8, color: "#ececee" }} formatter={(value) => formatCurrency(Number(value), currency)}/><Area type="monotone" dataKey="close" stroke="#3ecf8e" strokeWidth={2} fill="url(#tickerFill)" activeDot={{ r: 4, fill: "#3ecf8e" }}/></AreaChart></ResponsiveContainer>;
}

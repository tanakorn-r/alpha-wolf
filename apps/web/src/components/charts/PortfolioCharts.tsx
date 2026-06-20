import { Area, AreaChart, CartesianGrid, Cell, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PortfolioDashboard } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import { ChartState } from "./ChartState";

const tooltipStyle = { background: "#1c1c20", border: "1px solid #34343c", borderRadius: 8, color: "#ececee", fontFamily: "IBM Plex Mono" };

export function PortfolioPerformanceChart({ data, loading, error, onRetry }: { data?: PortfolioDashboard; loading: boolean; error: boolean; onRetry: () => void }) {
  if (loading) return <ChartState state="loading" />;
  if (error) return <ChartState state="error" onRetry={onRetry} />;
  if (!data?.chart.length) return <ChartState state="empty" />;
  return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data.chart} margin={{ top: 20, right: 10, bottom: 0, left: 4 }}><defs><linearGradient id="cadencePortfolio" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3ecf8e" stopOpacity={0.28}/><stop offset="100%" stopColor="#3ecf8e" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#242429" strokeDasharray="3 4" vertical={false}/><XAxis dataKey="date" tick={{ fill: "#5a5a62", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={48}/><YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} tick={{ fill: "#5a5a62", fontSize: 10 }} axisLine={false} tickLine={false} width={44}/><Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(Number(value))}/><Area type="monotone" dataKey="value" stroke="#3ecf8e" strokeWidth={2} fill="url(#cadencePortfolio)"/><Line type="monotone" dataKey="cost" stroke="#5a5a62" strokeDasharray="5 5" dot={false}/></AreaChart></ResponsiveContainer>;
}

export function DcaPerformanceChart({ data }: { data: PortfolioDashboard }) {
  const points = data.chart.map((point) => ({ ...point, dca: data.markers.filter((marker) => marker.date === point.date).reduce((sum, marker) => sum + marker.amount, 0) || undefined }));
  if (!points.length) return <ChartState state="empty" />;
  return <ResponsiveContainer width="100%" height="100%"><AreaChart data={points}><CartesianGrid stroke="#242429" strokeDasharray="3 4" vertical={false}/><XAxis dataKey="date" hide/><YAxis hide/><Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(Number(value))}/><Area type="monotone" dataKey="value" stroke="#3ecf8e" fill="rgba(62,207,142,.08)"/><Line type="monotone" dataKey="dca" stroke="#f5c451" strokeWidth={0} dot={{ r: 4, fill: "#f5c451" }} connectNulls={false}/></AreaChart></ResponsiveContainer>;
}

export function AllocationChart({ data }: { data: PortfolioDashboard }) {
  const grouped = Object.values(data.holdings.reduce<Record<string, { name: string; value: number }>>((result, holding) => { const key=holding.sector || "Other"; result[key] ??= { name:key, value:0 }; result[key].value += holding.value; return result; }, {}));
  if (!grouped.length) return <ChartState state="empty" />;
  const colors=["#3ecf8e", "#f5c451", "#74a4ff", "#f2575c", "#8c8c95"];
  return <ResponsiveContainer width="100%" height="100%"><PieChart><Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(Number(value))}/><Pie data={grouped} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="none">{grouped.map((entry,index)=><Cell key={entry.name} fill={colors[index%colors.length]}/>)}</Pie></PieChart></ResponsiveContainer>;
}

export function buildChartPath(values: number[]) {
  if (!values.length) return "M 0 100";
  const min = Math.min(...values);
  const range = Math.max(Math.max(...values) - min, 1);
  const step = 100 / Math.max(values.length - 1, 1);
  return values
    .map((value, index) => {
      const x = index * step;
      const y = 90 - ((value - min) / range) * 72;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

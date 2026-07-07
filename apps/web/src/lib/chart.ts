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

export function paddedDomain(values: Array<number | null | undefined>, paddingRatio = 0.16): [number, number] {
  const clean = values.filter((value): value is number => Number.isFinite(value));
  if (!clean.length) return [0, 1];

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const center = (min + max) / 2;
  const naturalRange = max - min;
  const fallbackRange = Math.max(Math.abs(center) * 0.035, 1);
  const range = naturalRange > 0 ? naturalRange : fallbackRange;
  const padding = range * paddingRatio;

  return [min - padding, max + padding];
}

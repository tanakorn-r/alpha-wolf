export function DashboardSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((item) => <div key={item} className="skeleton-block h-24" />)}
      </div>
      <div className="skeleton-block h-96" />
    </div>
  );
}

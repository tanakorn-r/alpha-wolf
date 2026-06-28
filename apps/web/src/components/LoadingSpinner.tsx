export function LoadingSpinner({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`.trim()}
      style={{ width: size, height: size }}
    />
  );
}

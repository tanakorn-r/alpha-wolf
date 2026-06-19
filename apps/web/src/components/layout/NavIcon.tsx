export type NavIconKind = "dashboard" | "discover" | "search" | "insights";

export function NavIcon({ kind }: { kind: NavIconKind }) {
  const common = "h-[18px] w-[18px] flex-none fill-none stroke-current stroke-[1.8]";
  const paths: Record<NavIconKind, React.ReactNode> = {
    dashboard: <><path d="M4 11.5 12 4l8 7.5" /><path d="M6.5 10.5V20h11V10.5" /></>,
    discover: <><circle cx="12" cy="12" r="7.5" /><path d="M14.8 9.2 16 8l-1.2 1.2M8 16l1.2-1.2M9.2 8 8 6.8M16 16.2 14.8 15" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    insights: <><path d="M5 19h14" /><path d="M7 15l3-4 3 2 4-7" /></>
  };
  return <svg viewBox="0 0 24 24" className={common} aria-hidden="true">{paths[kind]}</svg>;
}

export type NavIconKind = "dashboard" | "discover" | "search" | "insights" | "analyst";

export function NavIcon({ kind }: { kind: NavIconKind }) {
  const common = "h-[18px] w-[18px] flex-none fill-none stroke-current stroke-[1.8]";
  const paths: Record<NavIconKind, React.ReactNode> = {
    dashboard: <><rect x="2.25" y="2.25" width="7.5" height="7.5" rx="1.4" /><rect x="14.25" y="2.25" width="7.5" height="7.5" rx="1.4" /><rect x="2.25" y="14.25" width="7.5" height="7.5" rx="1.4" /><rect x="14.25" y="14.25" width="7.5" height="7.5" rx="1.4" /></>,
    discover: <><rect x="2.4" y="4.5" width="19.2" height="17.1" rx="1.6" /><path d="M2.4 9.3h19.2M7.5 2.4V6M16.5 2.4V6" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    insights: <><path d="M5 19h14" /><path d="M7 15l3-4 3 2 4-7" /></>,
    analyst: <><path d="M4.5 18.5h15" /><path d="M6 14.5 9.5 11l3 2 5-6" /><circle cx="6" cy="14.5" r="1.2" /><circle cx="9.5" cy="11" r="1.2" /><circle cx="12.5" cy="13" r="1.2" /><circle cx="17.5" cy="7" r="1.2" /></>
  };
  return <svg viewBox="0 0 24 24" className={common} aria-hidden="true">{paths[kind]}</svg>;
}

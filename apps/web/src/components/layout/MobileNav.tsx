import { NavLink } from "react-router-dom";
import alphaWolfIcon from "../../assets/icons/alphawolf-icon.png";
import { NavIcon, type NavIconKind } from "./NavIcon";

const items: Array<{ to: string; label: string; kind: NavIconKind; end?: boolean }> = [
  { to: "/", label: "Home", kind: "dashboard", end: true },
  { to: "/scanner", label: "Hunt", kind: "search" },
  { to: "/calendar", label: "Income", kind: "discover" },
];

// Native-style bottom tab bar. Shown only below the sidebar breakpoint (<720px);
// pairs with AppSidebar's `max-[719px]:hidden`. Bottom padding clears the
// home-indicator via the safe-area inset (viewport-fit=cover in index.html).
export function MobileNav() {
  return (
    <nav className="aw-mobile-nav fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-[#2a2a31] bg-[#0e0e10]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur min-[720px]:hidden">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-semibold transition-colors ${isActive ? "text-[#3ecf8e]" : "text-[#8c8c95]"}`
          }
        >
          <NavIcon kind={item.kind} />
          <span>{item.label}</span>
        </NavLink>
      ))}
      <NavLink
        to="/hunt-ai"
        className={({ isActive }) =>
          `flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-bold transition-colors ${isActive ? "text-[#c77dff]" : "text-[#8c8c95]"}`
        }
      >
        <span className="grid h-[18px] w-[18px] place-items-center overflow-hidden rounded-[5px] border border-[#27363b]">
          <img src={alphaWolfIcon} alt="" className="h-full w-full object-cover" />
        </span>
        <span>Hunt AI</span>
      </NavLink>
    </nav>
  );
}

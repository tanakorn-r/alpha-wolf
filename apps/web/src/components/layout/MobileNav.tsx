import { NavLink } from "react-router-dom";
import alphaWolfIcon from "../../assets/icons/alphawolf-icon.png";
import { NavIcon } from "./NavIcon";
import { APP_NAVIGATION } from "./navigation";

// Native-style bottom tab bar. Shown below the shared shell breakpoint (<900px);
// pairs with AppSidebar's `max-[899px]:hidden`. Bottom padding clears the
// home-indicator via the shared native/CSS safe-area inset.
export function MobileNav() {
  return (
    <nav aria-label="Primary navigation" className="aw-mobile-nav fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-[#2a2a31] bg-[#0e0e10]/95 pb-[var(--aw-safe-bottom)] backdrop-blur min-[900px]:hidden">
      {APP_NAVIGATION.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-2 text-[9.5px] font-semibold transition-colors ${isActive ? item.premium ? "text-[#c77dff]" : "text-[#3ecf8e]" : "text-[#8c8c95]"}`
          }
        >
          {item.premium ? (
            <span className="grid h-[18px] w-[18px] place-items-center overflow-hidden rounded-[5px] border border-[#27363b]">
              <img src={alphaWolfIcon} alt="" className="h-full w-full object-cover" />
            </span>
          ) : <NavIcon kind={item.kind} />}
          <span className="max-w-full truncate">{item.mobileLabel}</span>
        </NavLink>
      ))}
    </nav>
  );
}

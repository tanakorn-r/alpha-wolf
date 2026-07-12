import type { ReactNode } from "react";
import { RiskDisclaimer } from "../ui/RiskDisclaimer";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { MobileNav } from "./MobileNav";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="aw-app-shell min-h-screen">
      <div className="aw-shell min-h-screen">
        <AppSidebar />
        {/* Content offset is mobile-first so the media queries can't conflict:
            0 (bottom-nav mobile) → 70px (collapsed rail) → 220px (full sidebar). */}
        <div className="aw-content flex min-h-screen min-w-0 flex-1 flex-col">
          <AppHeader />
          <main className="aw-main min-w-0 flex-1 px-6 pb-16 pt-4 max-[719px]:px-4 max-[719px]:pb-24">{children}</main>
          <RiskDisclaimer />
        </div>
        <MobileNav />
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { CreditPurchaseReturn } from "../billing/CreditTopUp";
import { RiskDisclaimer } from "../ui/RiskDisclaimer";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { MobileNav } from "./MobileNav";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="aw-app-shell min-h-screen">
      <div className="aw-shell min-h-screen">
        <CreditPurchaseReturn />
        <AppSidebar />
        {/* One shell breakpoint keeps bottom-nav and sidebar layouts mutually exclusive. */}
        <div className="aw-content flex min-h-screen min-w-0 flex-1 flex-col">
          <AppHeader />
          <main className="aw-main min-w-0 flex-1 overflow-x-clip px-6 pb-16 pt-4 max-[899px]:px-3.5 max-[899px]:pb-24">{children}</main>
          <RiskDisclaimer />
        </div>
        <MobileNav />
      </div>
    </div>
  );
}

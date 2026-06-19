import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="aw-app-shell min-h-screen p-5 md:p-8">
      <div className="aw-shell mx-auto flex overflow-hidden rounded-[22px] bg-white">
        <AppSidebar />
        <div className="aw-content flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <main className="aw-main min-w-0 flex-1 overflow-y-auto p-5">{children}</main>
        </div>
      </div>
    </div>
  );
}

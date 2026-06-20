import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="aw-app-shell min-h-screen">
      <div className="aw-shell flex min-h-screen overflow-hidden">
        <AppSidebar />
        <div className="aw-content flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <main className="aw-main min-w-0 flex-1 px-7 pb-20 pt-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

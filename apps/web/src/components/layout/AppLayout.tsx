import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="aw-app-shell min-h-screen">
      <div className="aw-shell min-h-screen">
        <AppSidebar />
        <div className="aw-content flex min-h-screen min-w-0 flex-1 flex-col pl-[236px] max-[900px]:pl-[76px]">
          <AppHeader />
          <main className="aw-main min-w-0 flex-1 px-7 pb-20 pt-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

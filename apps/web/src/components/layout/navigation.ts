import type { NavIconKind } from "./NavIcon";

export type AppNavigationItem = {
  to: string;
  label: string;
  mobileLabel: string;
  kind: NavIconKind;
  end?: boolean;
  premium?: boolean;
};

// Desktop and mobile intentionally consume one list. A route must never appear
// in only one navigation surface again.
export const APP_NAVIGATION: AppNavigationItem[] = [
  { to: "/", label: "Dashboard", mobileLabel: "Home", kind: "dashboard", end: true },
  { to: "/scanner", label: "Stock Hunt", mobileLabel: "Hunt", kind: "search" },
  { to: "/hunt-ai", label: "Hunt AI", mobileLabel: "Hunt AI", kind: "analyst", premium: true },
];

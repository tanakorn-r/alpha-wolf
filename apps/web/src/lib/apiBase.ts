import { Capacitor } from "@capacitor/core";

const configuredApiBase = import.meta.env.VITE_API_BASE?.trim();

// Browser traffic must remain same-origin so Safari treats the HttpOnly session cookie as
// first-party. Packaged Capacitor apps have no Pages Function at /api, so they continue to use
// the explicitly configured Cloud Run URL documented in MOBILE.md.
export const API_BASE = Capacitor.isNativePlatform()
  ? configuredApiBase || "/api"
  : "/api";

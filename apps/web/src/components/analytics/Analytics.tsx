import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { analyticsAvailable, getAnalyticsConsent, identifyAnalyticsUser, initializeAnalytics, setAnalyticsConsent, trackPage, type AnalyticsConsent } from "../../lib/analytics";
import { loadAuthUser } from "../../lib/api";

export function AnalyticsTracker() {
  const location = useLocation();
  const account = useQuery({ queryKey: ["auth-user"], queryFn: loadAuthUser, staleTime: 300_000, retry: 0 });

  useEffect(() => {
    trackPage(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const user = account.data;
    identifyAnalyticsUser(user ? { id: user.id, plan: user.plan, locale: user.settings?.dateLocale } : null);
  }, [account.data]);

  return null;
}

export function AnalyticsConsentBanner() {
  const [consent, setConsent] = useState<AnalyticsConsent>(() => getAnalyticsConsent());

  useEffect(() => {
    void initializeAnalytics();
    const onChange = (event: Event) => setConsent((event as CustomEvent<AnalyticsConsent>).detail);
    const onSensitiveUrlCleared = () => void initializeAnalytics();
    window.addEventListener("aw:analytics-consent", onChange);
    window.addEventListener("aw:sensitive-url-cleared", onSensitiveUrlCleared);
    return () => {
      window.removeEventListener("aw:analytics-consent", onChange);
      window.removeEventListener("aw:sensitive-url-cleared", onSensitiveUrlCleared);
    };
  }, []);

  if (!analyticsAvailable() || consent !== "unknown") return null;

  return (
    <aside className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[100] mx-auto max-w-[720px] rounded-[14px] border border-[#34343c] bg-[#161619]/[0.98] p-4 text-[#ececee] shadow-2xl backdrop-blur-xl" aria-label="Analytics choice">
      <div className="flex flex-col gap-3 min-[620px]:flex-row min-[620px]:items-center min-[620px]:justify-between">
        <p className="text-[11.5px] leading-[1.55] text-[#a0a0a8]">
          Allow privacy-safe Firebase analytics? It helps us measure successful workflows, errors, loading time, and app performance. We do not send financial values, account details, form input, ticker searches, or AI request contents. See the <Link to="/privacy" className="text-[#74a4ff] underline underline-offset-2">Privacy Policy</Link>.
        </p>
        <div className="flex flex-none gap-2">
          <button type="button" onClick={() => setAnalyticsConsent("denied")} className="rounded-[8px] border border-[#3a3a43] px-3 py-2 text-[11px] font-bold text-[#9a9aa3]">No thanks</button>
          <button type="button" onClick={() => setAnalyticsConsent("granted")} className="rounded-[8px] bg-[#3ecf8e] px-3 py-2 text-[11px] font-extrabold text-[#07100c]">Allow analytics</button>
        </div>
      </div>
    </aside>
  );
}

export function AnalyticsPreference() {
  const [consent, setConsent] = useState<AnalyticsConsent>(() => getAnalyticsConsent());
  if (!analyticsAvailable()) return null;

  const choose = (next: Exclude<AnalyticsConsent, "unknown">) => {
    setAnalyticsConsent(next);
    setConsent(next);
    if (next === "denied") window.location.reload();
  };

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[9px] border border-[#303039] bg-[#0e0e10] p-3">
      <span>Current choice: <strong className="text-[#ececee]">{consent === "granted" ? "analytics allowed" : consent === "denied" ? "analytics declined" : "not chosen"}</strong></span>
      <div className="flex gap-2">
        <button type="button" onClick={() => choose("denied")} className="rounded-[7px] border border-[#3a3a43] px-3 py-2 text-[10.5px] font-bold">Decline</button>
        <button type="button" onClick={() => choose("granted")} className="rounded-[7px] bg-[#3ecf8e] px-3 py-2 text-[10.5px] font-extrabold text-[#07100c]">Allow</button>
      </div>
    </div>
  );
}

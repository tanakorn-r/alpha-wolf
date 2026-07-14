import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { confirmAiCreditCheckout, createAiCreditCheckout } from "../../lib/api";
import { Modal } from "../ui/Modal";

const PACKS = [
  { credits: 25 as const, price: "$2.99", note: "A few extra Agent reads" },
  { credits: 75 as const, price: "$6.99", note: "Best for regular research", popular: true },
  { credits: 200 as const, price: "$14.99", note: "Heavy testing and re-runs" },
];

export function CreditTopUpButton({ label = "Refill AI tokens", className = "" }: { label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-[var(--aw-radius-chip)] border border-[#3ecf8e]/40 bg-[#3ecf8e]/10 px-3 py-1.5 text-[10px] font-bold text-[#3ecf8e] transition-colors hover:bg-[#3ecf8e]/15 ${className}`}
      >
        + {label}
      </button>
      {open ? <CreditTopUpModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CreditTopUpModal({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<25 | 75 | 200>(75);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");
  const pack = PACKS.find((item) => item.credits === selected)!;

  const confirm = async () => {
    setBuying(true);
    setError("");
    try {
      const returnUrl = new URL(window.location.href);
      returnUrl.searchParams.delete("credit_purchase");
      returnUrl.searchParams.delete("session_id");
      const returnPath = `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
      const checkoutUrl = await createAiCreditCheckout(selected, returnPath);
      window.location.assign(checkoutUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not refill AI tokens");
    } finally {
      setBuying(false);
    }
  };

  return (
    <Modal title="Refill AI tokens" onClose={onClose}>
      <>
          <div className="rounded-[var(--aw-radius-control)] border border-[#f5c451]/25 bg-[#f5c451]/[0.06] px-3 py-2.5 text-[10.5px] leading-[1.5] text-[#d5c28c]">
            <b className="text-[#f5c451]">Stripe test checkout.</b> You will continue to Stripe&apos;s hosted sandbox. Use a Stripe test card; purchased tokens stay on your account until used, but do not unlock Pro-only tabs.
          </div>
          <div className="mt-3 grid gap-2">
            {PACKS.map((item) => (
              <button
                key={item.credits}
                type="button"
                onClick={() => setSelected(item.credits)}
                className={`flex items-center gap-3 rounded-[var(--aw-radius-control)] border px-3.5 py-3 text-left transition-colors ${selected === item.credits ? "border-[#3ecf8e]/55 bg-[#3ecf8e]/[0.08]" : "border-[#2a2a31] bg-[#111113] hover:border-[#44444d]"}`}
              >
                <span className={`grid h-4 w-4 place-items-center rounded-full border ${selected === item.credits ? "border-[#3ecf8e]" : "border-[#5a5a62]"}`}>
                  {selected === item.credits ? <span className="h-2 w-2 rounded-full bg-[#3ecf8e]" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[13px] font-bold text-[#ececee]">{item.credits} AI tokens {item.popular ? <span className="rounded-[4px] bg-[#c77dff]/15 px-1.5 py-0.5 text-[8px] text-[#c77dff]">POPULAR</span> : null}</span>
                  <span className="mt-0.5 block text-[10px] text-[#777780]">{item.note}</span>
                </span>
                <span className="font-mono text-[13px] font-bold text-[#ececee]">{item.price}</span>
              </button>
            ))}
          </div>
          {error ? <div className="mt-3 rounded-[8px] border border-[#f2575c]/30 bg-[#f2575c]/10 px-3 py-2 text-[10.5px] text-[#f2575c]">{error}</div> : null}
          <button type="button" disabled={buying} onClick={confirm} className="mt-4 w-full rounded-[var(--aw-radius-control)] bg-[#3ecf8e] px-4 py-2.5 text-[12px] font-bold text-[#07120d] disabled:opacity-50">
            {buying ? "Opening Stripe…" : `Continue to Stripe · ${pack.price}`}
          </button>
      </>
    </Modal>
  );
}

export function CreditPurchaseReturn({ onConfirmed }: { onConfirmed?: () => void }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ kind: "loading" | "success" | "cancelled" | "error"; title: string; body: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("credit_purchase");
    const sessionId = params.get("session_id");
    const clearPurchaseParams = () => {
      params.delete("credit_purchase");
      params.delete("session_id");
      window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
    };
    if (status === "cancelled") {
      setNotice({ kind: "cancelled", title: "Checkout cancelled", body: "No payment was taken. Your AI token balance is unchanged." });
      clearPurchaseParams();
      return;
    }
    if (status !== "success" || !sessionId) return;
    let cancelled = false;
    setNotice({ kind: "loading", title: "Confirming payment", body: "Stripe approved the checkout. We’re refilling your AI tokens now…" });
    void confirmAiCreditCheckout(sessionId)
      .then(async ({ user, purchasedCredits }) => {
        if (cancelled) return;
        queryClient.setQueryData(["auth-user"], user);
        await queryClient.invalidateQueries({ queryKey: ["auth-user"] });
        setNotice({
          kind: "success",
          title: "Payment successful",
          body: `${purchasedCredits} AI tokens were added. You now have ${user.aiUsage?.tokens ?? 0} purchased tokens and ${user.aiUsage?.remaining ?? 0} total runs available.`,
        });
        onConfirmed?.();
        window.dispatchEvent(new Event("aw:credits-added"));
        clearPurchaseParams();
      })
      .catch((reason) => {
        if (!cancelled) {
          setNotice({
            kind: "error",
            title: "Payment needs verification",
            body: reason instanceof Error ? reason.message : "We could not confirm the Stripe payment yet.",
          });
        }
      });
    return () => { cancelled = true; };
  }, [attempt, onConfirmed, queryClient]);

  if (!notice) return null;
  const accent = notice.kind === "error" ? "#f2575c" : notice.kind === "cancelled" ? "#f5c451" : "#3ecf8e";
  return (
    <div className="fixed right-5 top-5 z-[70] w-[min(390px,calc(100vw-2rem))] overflow-hidden rounded-[14px] border bg-[#141417] shadow-[0_24px_80px_rgba(0,0,0,0.65)]" style={{ borderColor: `${accent}55` }} role={notice.kind === "error" ? "alert" : "status"}>
      <div className="h-1 w-full" style={{ background: accent }} />
      <div className="flex gap-3 p-4">
        <div className="grid h-9 w-9 flex-none place-items-center rounded-full border text-[17px] font-bold" style={{ borderColor: `${accent}55`, background: `${accent}16`, color: accent }}>
          {notice.kind === "loading" ? "…" : notice.kind === "success" ? "✓" : notice.kind === "cancelled" ? "–" : "!"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-[#ececee]">{notice.title}</div>
          <div className="mt-1 text-[11px] leading-[1.5] text-[#9a9aa3]">{notice.body}</div>
          {notice.kind === "error" ? (
            <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-2 text-[10.5px] font-bold text-[#74a4ff] hover:text-[#9abfff]">Retry verification</button>
          ) : null}
        </div>
        {notice.kind !== "loading" ? <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss payment notice" className="grid h-7 w-7 flex-none place-items-center rounded-[6px] text-[#6f6f78] hover:bg-white/[0.05] hover:text-[#ececee]">×</button> : null}
      </div>
    </div>
  );
}

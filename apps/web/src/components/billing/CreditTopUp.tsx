import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { confirmAiCreditCheckout, createAiCreditCheckout } from "../../lib/api";
import { Modal } from "../ui/Modal";

const PACKS = [
  { credits: 25 as const, price: "$2.99", note: "A few extra Agent reads" },
  { credits: 75 as const, price: "$6.99", note: "Best for regular research", popular: true },
  { credits: 200 as const, price: "$14.99", note: "Heavy testing and re-runs" },
];

export function CreditTopUpButton({ label = "Add AI credits", className = "" }: { label?: string; className?: string }) {
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
      const checkoutUrl = await createAiCreditCheckout(selected);
      window.location.assign(checkoutUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add AI credits");
    } finally {
      setBuying(false);
    }
  };

  return (
    <Modal title="Add AI credits" onClose={onClose}>
      <>
          <div className="rounded-[var(--aw-radius-control)] border border-[#f5c451]/25 bg-[#f5c451]/[0.06] px-3 py-2.5 text-[10.5px] leading-[1.5] text-[#d5c28c]">
            <b className="text-[#f5c451]">Stripe test checkout.</b> You will continue to Stripe&apos;s hosted sandbox. Use a Stripe test card; purchased credits expire with the current monthly quota period.
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
                  <span className="flex items-center gap-2 text-[13px] font-bold text-[#ececee]">{item.credits} AI runs {item.popular ? <span className="rounded-[4px] bg-[#c77dff]/15 px-1.5 py-0.5 text-[8px] text-[#c77dff]">POPULAR</span> : null}</span>
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
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("credit_purchase");
    const sessionId = params.get("session_id");
    if (status !== "success" || !sessionId) return;
    let cancelled = false;
    setMessage("Confirming Stripe payment…");
    void confirmAiCreditCheckout(sessionId)
      .then(async (user) => {
        if (cancelled) return;
        queryClient.setQueryData(["auth-user"], user);
        await queryClient.invalidateQueries({ queryKey: ["auth-user"] });
        setMessage(`${user.aiUsage?.remaining ?? 0} AI runs are now available.`);
        onConfirmed?.();
        window.dispatchEvent(new Event("aw:credits-added"));
      })
      .catch((reason) => {
        if (!cancelled) setMessage(reason instanceof Error ? reason.message : "Could not confirm Stripe payment");
      })
      .finally(() => {
        if (cancelled) return;
        params.delete("credit_purchase");
        params.delete("session_id");
        window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
      });
    return () => { cancelled = true; };
  }, [onConfirmed, queryClient]);

  if (!message) return null;
  return <div className="rounded-[var(--aw-radius-control)] border border-[#3ecf8e]/30 bg-[#3ecf8e]/[0.07] px-3 py-2 text-center text-[9.5px] text-[#3ecf8e]">{message}</div>;
}

import { useState } from "react";
import { GoogleAccountModal } from "../../components/auth/GoogleAccount";
import { Modal } from "../../components/ui/Modal";

export function ProPromoBanner({
  open,
  signedIn,
  onClose,
  onRedeem,
  redeeming,
}: {
  open: boolean;
  signedIn: boolean;
  onClose: () => void;
  onRedeem: () => void;
  redeeming: boolean;
}) {
  const [signInOpen, setSignInOpen] = useState(false);
  if (!open) return null;

  return (
    <>
      <Modal title="Start free Pro trial" onClose={onClose}>
        <div className="relative -m-5 w-[calc(100%+2.5rem)] bg-[linear-gradient(135deg,#3ecf8e,#4d96ff,#c77dff)] p-[2px]">
          <div className="rounded-[16px] bg-[#101013] px-6 py-6 sm:px-8">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-[13px] border border-[#3ecf8e]/30 bg-[#3ecf8e]/10 text-[#3ecf8e]">
              <svg width="24" height="24" viewBox="0 0 16 16" fill="none"><path d="M8 13V3M4.5 6.5 8 3l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div className="mt-4 text-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#3ecf8e]">Launch offer · no card</div>
              <h2 className="mt-1.5 text-[24px] font-extrabold tracking-[-0.5px] text-[#ececee]">Use Hunt AI Pro free for 30 days</h2>
              <p className="mx-auto mt-2 max-w-[420px] text-[12.5px] leading-[1.65] text-[#8c8c95]">Unlock Daily Brief, Buy Timing, AI Replay, Stock Analyst, Strategy AI, and Next 10 immediately. Your trial ends automatically—no payment details and no surprise charge.</p>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 text-[11.5px] text-[#bcbcc2]">
              {["100 persistent AI tokens", "All Hunt AI Pro tabs", "Real account usage tracking", "Cancel nothing—trial simply ends"].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-[8px] border border-[#25252b] bg-[#161619] px-3 py-2"><span className="text-[#3ecf8e]">✓</span>{item}</div>
              ))}
            </div>
            <button
              type="button"
              disabled={redeeming}
              onClick={() => signedIn ? onRedeem() : setSignInOpen(true)}
              className="mt-5 w-full rounded-[10px] bg-[linear-gradient(90deg,#3ecf8e,#4d96ff)] px-4 py-3 text-[13.5px] font-extrabold text-white hover:opacity-90 disabled:opacity-60"
            >
              {!signedIn ? "Sign in to claim 30 days free" : redeeming ? "Activating Pro…" : "Activate my free Pro month"}
            </button>
            <div className="mt-2 text-center text-[10px] text-[#5a5a62]">One trial per account · token balances are enforced server-side</div>
          </div>
        </div>
      </Modal>
      {signInOpen ? <GoogleAccountModal user={null} onClose={() => setSignInOpen(false)} /> : null}
    </>
  );
}
